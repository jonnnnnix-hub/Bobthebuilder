import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolygonService } from '../polygon/polygon.service.js';
import { CalculationService, FeatureSet, RankedFeature, SelectionReason } from '../calculation/calculation.service.js';
import { OratsService } from '../orats/orats.service.js';
import * as crypto from 'crypto';
import { MarketDataService } from '../market-data/market-data.service.js';

type AnalysisStage = 'config' | 'price' | 'options' | 'historical_bars' | 'historical_iv' | 'compute' | 'storage';
type IvHistorySource = 'orats' | 'database_fallback' | 'missing';

type SymbolProcessingResult =
  | { symbol: string; status: 'processed'; feature: FeatureSet }
  | { symbol: string; status: 'skipped'; stage: AnalysisStage; reason: string }
  | { symbol: string; status: 'failed'; stage: AnalysisStage; reason: string; retryable: boolean };

type PersistedFeature = FeatureSet & {
  rank: number | null;
  selected: boolean;
  vrp_percentile: number | null;
  iv_z_percentile: number | null;
  iv_history_source: IvHistorySource;
  selection_reason: SelectionReason;
};

type RunIssueSummary = {
  failures: Array<{
    symbol: string;
    stage: AnalysisStage;
    reason: string;
    retryable: boolean;
  }>;
  skipped: Array<{
    symbol: string;
    stage: AnalysisStage;
    reason: string;
  }>;
};

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private static readonly BATCH_SIZE = 5;
  private static readonly BATCH_DELAY_MS = 1500;
  private static readonly STORE_BATCH_SIZE = 20;

  constructor(
    private prisma: PrismaService,
    private polygon: PolygonService,
    private orats: OratsService,
    private calculation: CalculationService,
    private marketData: MarketDataService,
  ) {}

  /**
   * Execute one complete analysis cycle:
   * 1. Fetch active symbols from universe
   * 2. For each symbol: fetch options + historical data
   * 3. Compute features (ATM IV, HV, VRP, real-history IV z-scores)
   * 4. Rank and select top candidates
   * 5. Store results in database
   */
  async runAnalysis(trigger: string = 'manual'): Promise<{
    run_id: string;
    symbols_analyzed: number;
    signals_generated: number;
    selected: string[];
    errors: string[];
    duration_ms: number;
  }> {
    const runId = `run_${crypto.randomUUID().slice(0, 8)}_${Date.now()}`;
    const startTime = Date.now();
    const errors: string[] = [];
    const issues: RunIssueSummary = {
      failures: [],
      skipped: [],
    };

    this.logger.log(`=== Analysis Run ${runId} started (trigger: ${trigger}) ===`);

    // Create run record
    await this.prisma.analysis_run.create({
      data: { run_id: runId, trigger, status: 'running' },
    });

    try {
      if (!this.polygon.isConfigured()) {
        throw new Error('POLYGON_API_KEY is not configured');
      }

      // 1. Get active symbols
      const symbols = await this.prisma.universe.findMany({
        where: { active: true },
        select: { symbol: true },
      });
      this.logger.log(`Processing ${symbols.length} active symbols`);

      if (symbols.length === 0) {
        return await this.finalizeSuccessfulRun(runId, startTime, [], issues, errors);
      }

      // 2. Load config
      const config = await this.getConfig();

      // 3. Process each symbol with rate limiting
      const allFeatures: FeatureSet[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < symbols.length; i += AnalysisService.BATCH_SIZE) {
        const batch = symbols.slice(i, i + AnalysisService.BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(({ symbol }: { symbol: string }) => this.processSymbol(symbol)),
        );

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          if (result.status === 'processed') {
            allFeatures.push(result.feature);
            continue;
          }

          if (result.status === 'skipped') {
            issues.skipped.push({
              symbol: result.symbol,
              stage: result.stage,
              reason: result.reason,
            });
            this.logger.warn(`Skipped ${result.symbol} at ${result.stage}: ${result.reason}`);
            continue;
          }

          issues.failures.push({
            symbol: result.symbol,
            stage: result.stage,
            reason: result.reason,
            retryable: result.retryable,
          });
          const errMsg = `${result.symbol} [${result.stage}]: ${result.reason}`;
          errors.push(errMsg);
          this.logger.warn(`Failed to process ${result.symbol} at ${result.stage}: ${result.reason}`);
        }

        // Rate limiting between batches
        if (i + AnalysisService.BATCH_SIZE < symbols.length) {
          await this.delay(AnalysisService.BATCH_DELAY_MS);
        }

        this.logger.log(`Progress: ${Math.min(i + AnalysisService.BATCH_SIZE, symbols.length)}/${symbols.length} symbols processed`);
      }

      this.logger.log(`Computed features for ${allFeatures.length} symbols`);

      if (allFeatures.length === 0) {
        throw new Error('Analysis produced no features for any active symbols');
      }

      // 4. Rank and select
      const { ranked } = this.calculation.rankAndSelect(
        allFeatures,
        config.vrpThresholdPct,
        config.ivZThresholdPct,
        config.topN,
      );

      const featuresToStore = this.mergeRankedFeatures(allFeatures, ranked);
      const selected = featuresToStore.filter(feature => feature.selected).map(feature => feature.symbol);
      this.logger.log(`Selected ${selected.length} signals: ${selected.join(', ')}`);

      // 5. Store signals in database
      if (featuresToStore.length > 0) {
        // Use a transaction with small batches to avoid timeout
        for (let i = 0; i < featuresToStore.length; i += AnalysisService.STORE_BATCH_SIZE) {
          const batch = featuresToStore.slice(i, i + AnalysisService.STORE_BATCH_SIZE);
          await this.prisma.$transaction(
            batch.map(f =>
              this.prisma.signal.upsert({
                where: {
                  symbol_date_run_id: {
                    symbol: f.symbol,
                    date: today,
                    run_id: runId,
                  },
                },
                update: {
                  atm_iv: f.atm_iv,
                  hv_10: f.hv_10,
                  hv_20: f.hv_20,
                  hv_60: f.hv_60,
                  vrp_20: f.vrp_20,
                  vrp_percentile: f.vrp_percentile,
                  iv_z: f.iv_z,
                  iv_z_percentile: f.iv_z_percentile,
                  iv_history_source: f.iv_history_source,
                  rank: f.rank,
                  selected: f.selected,
                  selection_reason: f.selection_reason,
                },
                create: {
                  symbol: f.symbol,
                  date: today,
                  run_id: runId,
                  atm_iv: f.atm_iv,
                  hv_10: f.hv_10,
                  hv_20: f.hv_20,
                  hv_60: f.hv_60,
                  vrp_20: f.vrp_20,
                  vrp_percentile: f.vrp_percentile,
                  iv_z: f.iv_z,
                  iv_z_percentile: f.iv_z_percentile,
                  iv_history_source: f.iv_history_source,
                  rank: f.rank,
                  selected: f.selected,
                  selection_reason: f.selection_reason,
                },
              })
            )
          );
        }
      }
      return await this.finalizeSuccessfulRun(runId, startTime, featuresToStore, issues, errors);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Analysis run ${runId} failed: ${error.message}`);

      await this.prisma.analysis_run.update({
        where: { run_id: runId },
        data: {
          status: 'failed',
          completed_at: new Date(),
          duration_ms: durationMs,
          errors: this.serializeIssues(issues, [...errors, error.message]),
        },
      });

      throw error;
    }
  }

  /**
   * Process a single symbol: fetch data and compute features.
   */
  private async processSymbol(symbol: string): Promise<SymbolProcessingResult> {
    let currentPrice: number | null;
    try {
      currentPrice = await this.polygon.getPreviousClose(symbol);
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'price', error);
    }

    if (!currentPrice) {
      return {
        symbol,
        status: 'skipped',
        stage: 'price',
        reason: 'No previous close data available',
      };
    }

    let options;
    try {
      options = await this.polygon.getOptionsSnapshot(symbol, currentPrice);
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'options', error);
    }

    let bars;
    try {
      bars = await this.marketData.getHistoricalBars(symbol, 80);
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'historical_bars', error);
    }

    if (bars.length === 0) {
      return {
        symbol,
        status: 'skipped',
        stage: 'historical_bars',
        reason: 'No historical bars available',
      };
    }

    const asOfDate = new Date();
    asOfDate.setHours(0, 0, 0, 0);

    const currentAtmIv = this.calculation.extractAtmIv(options, currentPrice);

    let ivZInputs: { currentIv: number | null; historicalIvs: number[]; source: IvHistorySource };
    try {
      ivZInputs = await this.getIvZInputs(symbol, asOfDate, currentAtmIv);
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'historical_iv', error);
    }

    try {
      const features = this.calculation.computeFeatures(
        symbol,
        options,
        currentPrice,
        bars,
        ivZInputs.historicalIvs,
        ivZInputs.currentIv,
      );
      if (features.atm_iv === null && features.hv_20 === null && features.hv_60 === null) {
        return {
          symbol,
          status: 'skipped',
          stage: 'compute',
          reason: 'Insufficient data to compute volatility features',
        };
      }

      if (features.atm_iv === null) {
        this.logger.debug(`No ATM IV available for ${symbol}`);
      }

      return {
        symbol,
        status: 'processed',
        feature: {
          ...features,
          iv_history_source: ivZInputs.source,
        } as FeatureSet,
      };
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'compute', error);
    }
  }

  /**
   * Get configuration from database.
   */
  private async getConfig(): Promise<{
    topN: number;
    vrpThresholdPct: number;
    ivZThresholdPct: number;
  }> {
    const configs = await this.prisma.configuration.findMany();
    const configMap = new Map<string, string>(
      configs.map(({ key, value }: { key: string; value: string }) => [key, value]),
    );

    const topN = this.parsePositiveInteger(configMap.get('top_n_candidates'), 'top_n_candidates', 5);
    const vrpThresholdPct = this.parseNumberInRange(configMap.get('vrp_threshold_percentile'), 'vrp_threshold_percentile', 95, 0, 100);
    const ivZThresholdPct = this.parseNumberInRange(configMap.get('iv_z_threshold_percentile'), 'iv_z_threshold_percentile', 92.5, 0, 100);

    return { topN, vrpThresholdPct, ivZThresholdPct };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getIvZInputs(
    symbol: string,
    asOfDate: Date,
    currentAtmIv: number | null,
  ): Promise<{ currentIv: number | null; historicalIvs: number[]; source: IvHistorySource }> {
    if (this.orats.isConfigured()) {
      try {
        const [currentIv30d, historicalIv30d] = await Promise.all([
          this.orats.getCurrentIv30d(symbol),
          this.orats.getHistoricalIv30dSeries(symbol, asOfDate, 60),
        ]);
        if (currentIv30d !== null && historicalIv30d.length > 0) {
          return {
            currentIv: currentIv30d,
            historicalIvs: historicalIv30d,
            source: 'orats',
          };
        }
      } catch (error) {
        this.logger.warn(`ORATS IV history unavailable for ${symbol}: ${this.getErrorMessage(error)}`);
      }
    }

    const historicalIvs = await this.getStoredHistoricalAtmIvSeries(symbol, asOfDate);
    return {
      currentIv: currentAtmIv,
      historicalIvs,
      source: historicalIvs.length > 0 ? 'database_fallback' : 'missing',
    };
  }

  private async getStoredHistoricalAtmIvSeries(symbol: string, asOfDate: Date): Promise<number[]> {
    const rows = await this.prisma.signal.findMany({
      where: {
        symbol,
        date: { lt: asOfDate },
        atm_iv: { not: null },
      },
      select: { atm_iv: true },
      orderBy: { date: 'desc' },
      take: 60,
    });

    return rows
      .map(row => row.atm_iv)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  }

  private mergeRankedFeatures(
    features: FeatureSet[],
    rankedFeatures: RankedFeature[],
  ): PersistedFeature[] {
    const rankedBySymbol = new Map(
      rankedFeatures.map(feature => [
        feature.symbol,
        {
          rank: feature.rank,
          selected: feature.selected,
          vrp_percentile: feature.vrp_percentile,
          iv_z_percentile: feature.iv_z_percentile,
          selection_reason: feature.selection_reason,
        },
      ]),
    );

    return features.map(feature => {
      const ranked = rankedBySymbol.get(feature.symbol);
      return {
        ...feature,
        rank: ranked?.rank ?? null,
        selected: ranked?.selected ?? false,
        vrp_percentile: ranked?.vrp_percentile ?? null,
        iv_z_percentile: ranked?.iv_z_percentile ?? null,
        iv_history_source: this.getIvHistorySource(feature),
        selection_reason: ranked?.selection_reason ?? this.getMissingMetricSelectionReason(feature),
      };
    });
  }

  private getIvHistorySource(feature: FeatureSet): IvHistorySource {
    const source = (feature as FeatureSet & { iv_history_source?: IvHistorySource }).iv_history_source;
    return source ?? (feature.iv_z !== null ? 'database_fallback' : 'missing');
  }

  private getMissingMetricSelectionReason(feature: FeatureSet): SelectionReason {
    if (feature.vrp_20 === null && feature.iv_z === null) {
      return 'missing_vrp_20_and_iv_z';
    }
    if (feature.vrp_20 === null) {
      return 'missing_vrp_20';
    }

    return 'missing_iv_z';
  }

  private buildFailure(symbol: string, stage: AnalysisStage, error: unknown): SymbolProcessingResult {
    return {
      symbol,
      status: 'failed',
      stage,
      reason: this.getErrorMessage(error),
      retryable: this.isRetryableError(error),
    };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Unknown error';
  }

  private isRetryableError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return ['timeout', 'timed out', 'rate limit', 'too many requests', 'socket', 'network', 'econnreset', 'econnrefused'].some(pattern => message.includes(pattern));
  }

  private serializeIssues(issues: RunIssueSummary, errors: string[]): string | null {
    if (issues.failures.length === 0 && issues.skipped.length === 0 && errors.length === 0) {
      return null;
    }

    return JSON.stringify({
      failure_count: issues.failures.length,
      skipped_count: issues.skipped.length,
      failures: issues.failures.slice(0, 20),
      skipped: issues.skipped.slice(0, 20),
      errors,
    });
  }

  private async finalizeSuccessfulRun(
    runId: string,
    startTime: number,
    features: PersistedFeature[],
    issues: RunIssueSummary,
    errors: string[],
  ): Promise<{
    run_id: string;
    symbols_analyzed: number;
    signals_generated: number;
    selected: string[];
    errors: string[];
    duration_ms: number;
  }> {
    const selected = features.filter(feature => feature.selected).map(feature => feature.symbol);
    const durationMs = Date.now() - startTime;

    await this.prisma.analysis_run.update({
      where: { run_id: runId },
      data: {
        status: 'completed',
        completed_at: new Date(),
        symbols_analyzed: features.length,
        signals_generated: selected.length,
        duration_ms: durationMs,
        errors: this.serializeIssues(issues, errors),
      },
    });

    this.logger.log(`=== Analysis Run ${runId} completed in ${durationMs}ms ===`);

    return {
      run_id: runId,
      symbols_analyzed: features.length,
      signals_generated: selected.length,
      selected,
      errors,
      duration_ms: durationMs,
    };
  }

  private parsePositiveInteger(value: string | undefined, key: string, defaultValue: number): number {
    const parsed = Number.parseInt(value ?? String(defaultValue), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid configuration value for ${key}`);
    }

    return parsed;
  }

  private parseNumberInRange(
    value: string | undefined,
    key: string,
    defaultValue: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number.parseFloat(value ?? String(defaultValue));
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`Invalid configuration value for ${key}`);
    }

    return parsed;
  }
}
