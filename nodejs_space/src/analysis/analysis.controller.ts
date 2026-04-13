import { Controller, Post, Get, Query, Headers, HttpException, HttpStatus, Logger, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { parseEnumQuery, parseIntegerQuery } from '../common/query.utils.js';

type TopSelectedSymbol = {
  symbol: string;
  _count: {
    symbol: number;
  };
};

type SignalDiagnosticsRow = {
  symbol: string;
  vrp_20: number | null;
  vrp_percentile: number | null;
  iv_z: number | null;
  iv_z_percentile: number | null;
  iv_history_source: string | null;
  rank: number | null;
  selected: boolean;
  selection_reason: string | null;
};

@ApiTags('Analysis')
@Controller('api/analysis')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);

  constructor(
    private analysisService: AnalysisService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger analysis run', description: 'Manually trigger a full analysis cycle. Requires API key for cron-triggered runs.' })
  @ApiHeader({ name: 'x-api-key', required: false, description: 'API key for automated/cron triggers' })
  @ApiResponse({ status: 200, description: 'Analysis run result' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async triggerAnalysis(
    @Headers('x-api-key') apiKey?: string,
    @Query('trigger') trigger?: string,
  ) {
    const triggerSource = parseEnumQuery(trigger, 'trigger', ['manual', 'cron']);

    // If trigger is 'cron', verify API key
    const cronKey = this.configService.get<string>('CRON_API_KEY');
    if (triggerSource === 'cron') {
      if (!apiKey || apiKey !== cronKey) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    this.logger.log(`Analysis triggered (source: ${triggerSource ?? 'manual'})`);
    const result = await this.analysisService.runAnalysis(triggerSource ?? 'manual');
    return result;
  }

  @Get('runs')
  @ApiOperation({ summary: 'Get analysis run history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of runs to return (default 20)' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'List of analysis runs' })
  async getRuns(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const take = parseIntegerQuery(limit, 'limit', 20, { min: 1, max: 100 });
    const where: Record<string, string> = {};
    if (status) where.status = status;

    const runs = await this.prisma.analysis_run.findMany({
      where,
      orderBy: { started_at: 'desc' },
      take,
    });
    return runs;
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get analysis statistics', description: 'Returns summary statistics across all completed runs' })
  @ApiResponse({ status: 200, description: 'Analysis statistics' })
  async getStats(@Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');

    const totalRuns = await this.prisma.analysis_run.count({ where: { status: 'completed' } });
    const totalSignals = await this.prisma.signal.count({ where: { selected: true } });

    const latestRun = await this.prisma.analysis_run.findFirst({
      where: { status: 'completed' },
      orderBy: { started_at: 'desc' },
    });

    // Get most frequently selected symbols
    const topSymbols = await this.prisma.signal.groupBy({
      by: ['symbol'],
      where: { selected: true },
      _count: { symbol: true },
      orderBy: { _count: { symbol: 'desc' } },
      take: 10,
    });

    // Average VRP of selected signals
    const avgVrp = await this.prisma.signal.aggregate({
      where: { selected: true },
      _avg: { vrp_20: true, iv_z: true, atm_iv: true },
    });

    return {
      total_completed_runs: totalRuns,
      total_signals_generated: totalSignals,
      latest_run: latestRun ? {
        run_id: latestRun.run_id,
        date: latestRun.started_at,
        symbols_analyzed: latestRun.symbols_analyzed,
        signals_generated: latestRun.signals_generated,
        duration_ms: latestRun.duration_ms,
      } : null,
      top_selected_symbols: topSymbols.map((entry: TopSelectedSymbol) => ({
        symbol: entry.symbol,
        times_selected: entry._count.symbol,
      })),
      average_signal_metrics: {
        avg_vrp_20: avgVrp._avg.vrp_20,
        avg_iv_z: avgVrp._avg.iv_z,
        avg_atm_iv: avgVrp._avg.atm_iv,
      },
    };
  }

  @Get('diagnostics')
  @ApiOperation({
    summary: 'Get run selection diagnostics',
    description: 'Returns threshold context, reason counts, top metric leaders, and nearest misses for a completed run.',
  })
  @ApiQuery({ name: 'run_id', required: false, type: String, description: 'Completed run to inspect. Defaults to the latest completed run.' })
  @ApiResponse({ status: 200, description: 'Selection diagnostics for a completed run' })
  async getDiagnostics(
    @Query('run_id') runId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const [config, targetRun] = await Promise.all([
      this.getThresholdConfig(),
      runId
        ? this.prisma.analysis_run.findFirst({ where: { run_id: runId, status: 'completed' } })
        : this.prisma.analysis_run.findFirst({
            where: { status: 'completed' },
            orderBy: { started_at: 'desc' },
          }),
    ]);

    if (!targetRun) {
      throw new BadRequestException(runId ? `Completed run not found: ${runId}` : 'No completed analysis runs found');
    }

    const signals = await this.prisma.signal.findMany({
      where: { run_id: targetRun.run_id },
      orderBy: [{ rank: 'asc' }, { symbol: 'asc' }],
    });

    const typedSignals = signals as SignalDiagnosticsRow[];
    const topByVrp = typedSignals
      .filter(signal => signal.vrp_20 !== null)
      .sort((left, right) => (right.vrp_20 ?? Number.NEGATIVE_INFINITY) - (left.vrp_20 ?? Number.NEGATIVE_INFINITY))
      .slice(0, 10);
    const topByIvZ = typedSignals
      .filter(signal => signal.iv_z !== null)
      .sort((left, right) => (right.iv_z ?? Number.NEGATIVE_INFINITY) - (left.iv_z ?? Number.NEGATIVE_INFINITY))
      .slice(0, 10);
    const nearestMisses = typedSignals
      .filter(signal => !signal.selected && signal.rank !== null)
      .map(signal => ({
        ...signal,
        combined_shortfall: this.calculateCombinedShortfall(
          signal.vrp_percentile,
          signal.iv_z_percentile,
          config.vrpThresholdPct,
          config.ivZThresholdPct,
        ),
      }))
      .sort((left, right) => left.combined_shortfall - right.combined_shortfall || (left.rank ?? 9999) - (right.rank ?? 9999))
      .slice(0, 10);

    const reasonCounts = typedSignals.reduce<Record<string, number>>((counts, signal) => {
      const reason = signal.selection_reason ?? 'unknown';
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {});
    const ivHistorySourceCounts = typedSignals.reduce<Record<string, number>>((counts, signal) => {
      const source = signal.iv_history_source ?? 'unknown';
      counts[source] = (counts[source] ?? 0) + 1;
      return counts;
    }, {});

    return {
      run: {
        run_id: targetRun.run_id,
        started_at: targetRun.started_at,
        completed_at: targetRun.completed_at,
        symbols_analyzed: targetRun.symbols_analyzed,
        signals_generated: targetRun.signals_generated,
        duration_ms: targetRun.duration_ms,
      },
      thresholds: {
        top_n: config.topN,
        vrp_percentile: config.vrpThresholdPct,
        iv_z_percentile: config.ivZThresholdPct,
      },
      summary: {
        total_signals: typedSignals.length,
        rankable_signals: typedSignals.filter(signal => signal.rank !== null).length,
        selected_signals: typedSignals.filter(signal => signal.selected).length,
        reason_counts: reasonCounts,
        iv_history_source_counts: ivHistorySourceCounts,
      },
      leaders: {
        by_vrp_20: topByVrp,
        by_iv_z: topByIvZ,
      },
      nearest_misses: nearestMisses,
    };
  }

  private async getThresholdConfig(): Promise<{ topN: number; vrpThresholdPct: number; ivZThresholdPct: number }> {
    const configs = await this.prisma.configuration.findMany();
    const configMap = new Map<string, string>(
      configs.map(({ key, value }: { key: string; value: string }) => [key, value]),
    );

    return {
      topN: Number.parseInt(configMap.get('top_n_candidates') ?? '5', 10),
      vrpThresholdPct: Number.parseFloat(configMap.get('vrp_threshold_percentile') ?? '95'),
      ivZThresholdPct: Number.parseFloat(configMap.get('iv_z_threshold_percentile') ?? '92.5'),
    };
  }

  private calculateCombinedShortfall(
    vrpPercentile: number | null,
    ivZPercentile: number | null,
    vrpThresholdPct: number,
    ivZThresholdPct: number,
  ): number {
    const vrpShortfall = Math.max(vrpThresholdPct - (vrpPercentile ?? 0), 0);
    const ivZShortfall = Math.max(ivZThresholdPct - (ivZPercentile ?? 0), 0);
    return Math.round((vrpShortfall + ivZShortfall) * 100) / 100;
  }
}
