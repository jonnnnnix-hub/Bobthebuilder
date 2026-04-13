import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolygonService } from '../polygon/polygon.service.js';
import {
  CalculationService,
  FeatureSet,
  SelectionReason,
} from '../calculation/calculation.service.js';
import { OratsService } from '../orats/orats.service.js';
import * as crypto from 'crypto';
import { MarketDataService } from '../market-data/market-data.service.js';
import {
  CompositeScoreResult,
  OptionSnapshotPoint,
  RankedCompositeScore,
  SymbolScoringInput,
} from '../scoring/interfaces.js';
import { ScoringService } from '../scoring/scoring.service.js';

type AnalysisStage =
  | 'config'
  | 'price'
  | 'options'
  | 'historical_bars'
  | 'historical_iv'
  | 'compute'
  | 'storage';
type IvHistorySource = 'orats' | 'database_fallback' | 'missing';

type SymbolProcessingResult =
  | {
      symbol: string;
      status: 'processed';
      feature: FeatureSet;
      scoringInput: SymbolScoringInput;
    }
  | { symbol: string; status: 'skipped'; stage: AnalysisStage; reason: string }
  | {
      symbol: string;
      status: 'failed';
      stage: AnalysisStage;
      reason: string;
      retryable: boolean;
    };

type PersistedFeature = FeatureSet & {
  rank: number | null;
  selected: boolean;
  vrp_percentile: number | null;
  iv_z_percentile: number | null;
  iv_history_source: IvHistorySource;
  selection_reason: SelectionReason;
  composite_score: number | null;
  composite_score_normalized: number | null;
  score_confidence: number | null;
  confidence_low: number | null;
  confidence_high: number | null;
  score_version: string;
  category_scores: Record<string, number | null> | null;
  composite_breakdown: CompositeScoreResult | null;
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
    private scoring: ScoringService,
  ) {}

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

    this.logger.log(
      `=== Analysis Run ${runId} started (trigger: ${trigger}) ===`,
    );

    await this.prisma.analysis_run.create({
      data: { run_id: runId, trigger, status: 'running' },
    });

    try {
      if (!this.polygon.isConfigured()) {
        throw new Error('POLYGON_API_KEY is not configured');
      }

      const symbols = await this.prisma.universe.findMany({
        where: { active: true },
        select: { symbol: true },
      });
      this.logger.log(`Processing ${symbols.length} active symbols`);

      if (symbols.length === 0) {
        return await this.finalizeSuccessfulRun(
          runId,
          startTime,
          [],
          issues,
          errors,
        );
      }

      const config = await this.getConfig();

      const allFeatures: FeatureSet[] = [];
      const allScoringInputs: SymbolScoringInput[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < symbols.length; i += AnalysisService.BATCH_SIZE) {
        const batch = symbols.slice(i, i + AnalysisService.BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(({ symbol }: { symbol: string }) =>
            this.processSymbol(symbol, today),
          ),
        );

        for (const result of batchResults) {
          if (result.status === 'processed') {
            allFeatures.push(result.feature);
            allScoringInputs.push(result.scoringInput);
            continue;
          }

          if (result.status === 'skipped') {
            issues.skipped.push({
              symbol: result.symbol,
              stage: result.stage,
              reason: result.reason,
            });
            this.logger.warn(
              `Skipped ${result.symbol} at ${result.stage}: ${result.reason}`,
            );
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
          this.logger.warn(
            `Failed to process ${result.symbol} at ${result.stage}: ${result.reason}`,
          );
        }

        if (i + AnalysisService.BATCH_SIZE < symbols.length) {
          await this.delay(AnalysisService.BATCH_DELAY_MS);
        }

        this.logger.log(
          `Progress: ${Math.min(i + AnalysisService.BATCH_SIZE, symbols.length)}/${symbols.length} symbols processed`,
        );
      }

      this.logger.log(`Computed features for ${allFeatures.length} symbols`);

      if (allFeatures.length === 0 || allScoringInputs.length === 0) {
        throw new Error('Analysis produced no features for any active symbols');
      }

      const scored = this.scoring.scoreUniverse(allScoringInputs);
      const ranked = this.scoring.rankAndSelect(scored, {
        topN: config.topN,
        compositeThresholdPct: config.compositeThresholdPct,
      });

      const featuresToStore = this.mergeRankedFeatures(allFeatures, ranked);
      const selected = featuresToStore
        .filter((feature) => feature.selected)
        .map((feature) => feature.symbol);
      this.logger.log(
        `Selected ${selected.length} signals: ${selected.join(', ')}`,
      );

      if (featuresToStore.length > 0) {
        for (
          let i = 0;
          i < featuresToStore.length;
          i += AnalysisService.STORE_BATCH_SIZE
        ) {
          const batch = featuresToStore.slice(
            i,
            i + AnalysisService.STORE_BATCH_SIZE,
          );
          await this.persistSignalBatch(batch, today, runId);
        }
      }

      return await this.finalizeSuccessfulRun(
        runId,
        startTime,
        featuresToStore,
        issues,
        errors,
      );
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Analysis run ${runId} failed: ${errorMessage}`);

      await this.prisma.analysis_run.update({
        where: { run_id: runId },
        data: {
          status: 'failed',
          completed_at: new Date(),
          duration_ms: durationMs,
          errors: this.serializeIssues(issues, [...errors, errorMessage]),
        },
      });

      throw error;
    }
  }

  private async processSymbol(
    symbol: string,
    asOfDate: Date,
  ): Promise<SymbolProcessingResult> {
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

    const currentAtmIv = this.calculation.extractAtmIv(options, currentPrice);

    let ivZInputs: {
      currentIv: number | null;
      historicalIvs: number[];
      source: IvHistorySource;
    };
    try {
      ivZInputs = await this.getIvZInputs(symbol, asOfDate, currentAtmIv);
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'historical_iv', error);
    }

    try {
      const [historicalSignals, optionSnapshots] = await Promise.all([
        this.getRecentSignalHistory(symbol, asOfDate),
        this.getRecentOptionSnapshots(symbol, asOfDate),
      ]);

      const features = this.calculation.computeFeatures(
        symbol,
        options,
        currentPrice,
        bars,
        ivZInputs.historicalIvs,
        ivZInputs.currentIv,
      );
      if (
        features.atm_iv === null &&
        features.hv_20 === null &&
        features.hv_60 === null
      ) {
        return {
          symbol,
          status: 'skipped',
          stage: 'compute',
          reason: 'Insufficient data to compute volatility features',
        };
      }

      const scoringInput: SymbolScoringInput = {
        symbol,
        currentPrice,
        atmIv: features.atm_iv,
        hv20: features.hv_20,
        vrp20: features.vrp_20,
        ivZ: features.iv_z,
        vrpPercentile: null,
        ivZPercentile: null,
        historicalBars: bars,
        currentOptions: options,
        historicalSignals,
        optionSnapshots,
        asOfDate,
      };

      return {
        symbol,
        status: 'processed',
        feature: {
          ...features,
          iv_history_source: ivZInputs.source,
        } as FeatureSet,
        scoringInput,
      };
    } catch (error: unknown) {
      return this.buildFailure(symbol, 'compute', error);
    }
  }

  private async getConfig(): Promise<{
    topN: number;
    compositeThresholdPct: number;
  }> {
    const configs = await this.prisma.configuration.findMany();
    const configMap = new Map<string, string>(
      configs.map(({ key, value }: { key: string; value: string }) => [
        key,
        value,
      ]),
    );

    const topN = this.parsePositiveInteger(
      configMap.get('top_n_candidates'),
      'top_n_candidates',
      5,
    );
    const compositeThresholdPct = this.parseNumberInRange(
      configMap.get('composite_score_threshold_percentile'),
      'composite_score_threshold_percentile',
      70,
      0,
      100,
    );

    return { topN, compositeThresholdPct };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getIvZInputs(
    symbol: string,
    asOfDate: Date,
    currentAtmIv: number | null,
  ): Promise<{
    currentIv: number | null;
    historicalIvs: number[];
    source: IvHistorySource;
  }> {
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
        this.logger.warn(
          `ORATS IV history unavailable for ${symbol}: ${this.getErrorMessage(error)}`,
        );
      }
    }

    const historicalIvs = await this.getStoredHistoricalAtmIvSeries(
      symbol,
      asOfDate,
    );
    return {
      currentIv: currentAtmIv,
      historicalIvs,
      source: historicalIvs.length > 0 ? 'database_fallback' : 'missing',
    };
  }

  private async getStoredHistoricalAtmIvSeries(
    symbol: string,
    asOfDate: Date,
  ): Promise<number[]> {
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
      .map((row) => row.atm_iv)
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
  }

  private async getRecentSignalHistory(
    symbol: string,
    asOfDate: Date,
  ): Promise<SymbolScoringInput['historicalSignals']> {
    const rows = await this.prisma.signal.findMany({
      where: {
        symbol,
        date: { lt: asOfDate },
      },
      select: {
        date: true,
        atm_iv: true,
        vrp_20: true,
        iv_z: true,
        composite_score: true,
        composite_score_normalized: true,
      },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return rows.map((row) => ({
      date: row.date,
      atmIv: row.atm_iv,
      vrp20: row.vrp_20,
      ivZ: row.iv_z,
      compositeScore: row.composite_score,
      normalizedScore: row.composite_score_normalized,
    }));
  }

  private async getRecentOptionSnapshots(
    symbol: string,
    asOfDate: Date,
  ): Promise<OptionSnapshotPoint[]> {
    const rows = await this.prisma.option_chain_snapshot.findMany({
      where: {
        underlying_symbol: symbol,
        snapshot_date: { lte: asOfDate },
      },
      select: {
        snapshot_date: true,
        snapshot_ts: true,
        expiration: true,
        strike: true,
        option_type: true,
        implied_volatility: true,
        delta: true,
        volume: true,
        open_interest: true,
        bid: true,
        ask: true,
      },
      orderBy: [{ snapshot_date: 'desc' }, { snapshot_ts: 'desc' }],
      take: 800,
    });

    return rows.map((row) => ({
      snapshotDate: row.snapshot_date,
      snapshotTs: row.snapshot_ts,
      expiration: row.expiration,
      strike: Number(row.strike),
      optionType: row.option_type as 'call' | 'put',
      impliedVolatility:
        row.implied_volatility !== null ? Number(row.implied_volatility) : null,
      delta: row.delta !== null ? Number(row.delta) : null,
      volume: row.volume,
      openInterest: row.open_interest,
      bid: row.bid !== null ? Number(row.bid) : null,
      ask: row.ask !== null ? Number(row.ask) : null,
    }));
  }

  private mergeRankedFeatures(
    features: FeatureSet[],
    rankedFeatures: RankedCompositeScore[],
  ): PersistedFeature[] {
    const rankedBySymbol = new Map(
      rankedFeatures.map((feature) => [
        feature.symbol,
        {
          rank: feature.rank,
          selected: feature.selected,
          selection_reason: feature.selectionReason,
          composite_score: feature.totalScore,
          composite_score_normalized: feature.normalizedScore,
          score_confidence: feature.confidence.score,
          confidence_low: feature.confidence.low,
          confidence_high: feature.confidence.high,
          breakdown: feature,
          category_scores: {
            vrp: feature.categories.vrp.score,
            ivz: feature.categories.ivz.score,
            term: feature.categories.term.score,
            skew: feature.categories.skew.score,
            momentum: feature.categories.momentum.score,
            flow: feature.categories.flow.score,
            regime_risk: feature.categories.regime_risk.score,
          },
        },
      ]),
    );

    return features.map((feature) => {
      const ranked = rankedBySymbol.get(feature.symbol);
      return {
        ...feature,
        rank: ranked?.rank ?? null,
        selected: ranked?.selected ?? false,
        vrp_percentile:
          ranked?.breakdown.categories.vrp.components.find(
            (component) => component.name === 'vrp_percentile',
          )?.rawValue ?? null,
        iv_z_percentile:
          ranked?.breakdown.categories.ivz.components.find(
            (component) => component.name === 'iv_universe_percentile',
          )?.rawValue ?? null,
        iv_history_source: this.getIvHistorySource(feature),
        selection_reason: (ranked?.selection_reason ??
          this.getMissingMetricSelectionReason(feature)) as SelectionReason,
        composite_score: ranked?.composite_score ?? null,
        composite_score_normalized: ranked?.composite_score_normalized ?? null,
        score_confidence: ranked?.score_confidence ?? null,
        confidence_low: ranked?.confidence_low ?? null,
        confidence_high: ranked?.confidence_high ?? null,
        score_version: 'v2',
        category_scores: ranked?.category_scores ?? null,
        composite_breakdown: ranked?.breakdown ?? null,
      };
    });
  }

  private getIvHistorySource(feature: FeatureSet): IvHistorySource {
    const source = (
      feature as FeatureSet & { iv_history_source?: IvHistorySource }
    ).iv_history_source;
    return source ?? (feature.iv_z !== null ? 'database_fallback' : 'missing');
  }

  private getMissingMetricSelectionReason(
    feature: FeatureSet,
  ): SelectionReason {
    if (feature.vrp_20 === null && feature.iv_z === null) {
      return 'missing_vrp_20_and_iv_z';
    }
    if (feature.vrp_20 === null) {
      return 'missing_vrp_20';
    }

    return 'missing_iv_z';
  }

  private async persistSignalBatch(
    batch: PersistedFeature[],
    today: Date,
    runId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const feature of batch) {
        const categoryScoresJson: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
          feature.category_scores ?? Prisma.JsonNull;
        const signal = await tx.signal.upsert({
          where: {
            symbol_date_run_id: {
              symbol: feature.symbol,
              date: today,
              run_id: runId,
            },
          },
          update: {
            atm_iv: feature.atm_iv,
            hv_10: feature.hv_10,
            hv_20: feature.hv_20,
            hv_60: feature.hv_60,
            vrp_20: feature.vrp_20,
            vrp_percentile: feature.vrp_percentile,
            iv_z: feature.iv_z,
            iv_z_percentile: feature.iv_z_percentile,
            iv_history_source: feature.iv_history_source,
            rank: feature.rank,
            selected: feature.selected,
            selection_reason: feature.selection_reason,
            composite_score: feature.composite_score,
            composite_score_normalized: feature.composite_score_normalized,
            score_confidence: feature.score_confidence,
            confidence_low: feature.confidence_low,
            confidence_high: feature.confidence_high,
            score_version: feature.score_version,
            category_scores: categoryScoresJson,
          },
          create: {
            symbol: feature.symbol,
            date: today,
            run_id: runId,
            atm_iv: feature.atm_iv,
            hv_10: feature.hv_10,
            hv_20: feature.hv_20,
            hv_60: feature.hv_60,
            vrp_20: feature.vrp_20,
            vrp_percentile: feature.vrp_percentile,
            iv_z: feature.iv_z,
            iv_z_percentile: feature.iv_z_percentile,
            iv_history_source: feature.iv_history_source,
            rank: feature.rank,
            selected: feature.selected,
            selection_reason: feature.selection_reason,
            composite_score: feature.composite_score,
            composite_score_normalized: feature.composite_score_normalized,
            score_confidence: feature.score_confidence,
            confidence_low: feature.confidence_low,
            confidence_high: feature.confidence_high,
            score_version: feature.score_version,
            category_scores: categoryScoresJson,
          },
        });

        await tx.score_breakdown.deleteMany({
          where: { signal_id: signal.id },
        });
        if (feature.composite_breakdown !== null) {
          const breakdownRows = Object.values(
            feature.composite_breakdown.categories,
          ).flatMap((category) =>
            category.components.map((component) => ({
              signal_id: signal.id,
              category: category.category,
              sub_score_name: component.name,
              raw_value: component.rawValue,
              scaled_score: component.scaledScore,
              max_possible: component.maxPoints,
              data_source: component.dataSource,
              is_null: component.scaledScore === null,
              metadata: component.notes
                ? { notes: component.notes }
                : undefined,
            })),
          );

          if (breakdownRows.length > 0) {
            await tx.score_breakdown.createMany({ data: breakdownRows });
          }
        }

        await tx.score_history.upsert({
          where: { signal_id: signal.id },
          update: {
            symbol: feature.symbol,
            score_date: today,
            run_id: runId,
            composite_score: feature.composite_score,
            normalized_score: feature.composite_score_normalized,
            confidence_score: feature.score_confidence,
            confidence_low: feature.confidence_low,
            confidence_high: feature.confidence_high,
            category_scores: categoryScoresJson,
            score_version: feature.score_version,
          },
          create: {
            signal_id: signal.id,
            symbol: feature.symbol,
            score_date: today,
            run_id: runId,
            composite_score: feature.composite_score,
            normalized_score: feature.composite_score_normalized,
            confidence_score: feature.score_confidence,
            confidence_low: feature.confidence_low,
            confidence_high: feature.confidence_high,
            category_scores: categoryScoresJson,
            score_version: feature.score_version,
          },
        });
      }
    });
  }

  private buildFailure(
    symbol: string,
    stage: AnalysisStage,
    error: unknown,
  ): SymbolProcessingResult {
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
    return [
      'timeout',
      'timed out',
      'rate limit',
      'too many requests',
      'socket',
      'network',
      'econnreset',
      'econnrefused',
    ].some((pattern) => message.includes(pattern));
  }

  private serializeIssues(
    issues: RunIssueSummary,
    errors: string[],
  ): string | null {
    if (
      issues.failures.length === 0 &&
      issues.skipped.length === 0 &&
      errors.length === 0
    ) {
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
    const selected = features
      .filter((feature) => feature.selected)
      .map((feature) => feature.symbol);
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

    this.logger.log(
      `=== Analysis Run ${runId} completed in ${durationMs}ms ===`,
    );

    return {
      run_id: runId,
      symbols_analyzed: features.length,
      signals_generated: selected.length,
      selected,
      errors,
      duration_ms: durationMs,
    };
  }

  private parsePositiveInteger(
    value: string | undefined,
    key: string,
    defaultValue: number,
  ): number {
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