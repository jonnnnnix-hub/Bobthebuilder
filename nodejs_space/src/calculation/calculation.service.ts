import { Injectable, Logger } from '@nestjs/common';
import { DailyBar, OptionContract } from '../polygon/polygon.service.js';

export interface FeatureSet {
  symbol: string;
  atm_iv: number | null;
  hv_10: number | null;
  hv_20: number | null;
  hv_60: number | null;
  vrp_20: number | null;
  iv_z: number | null;
}

export type SelectionReason =
  | 'selected'
  | 'missing_vrp_20'
  | 'missing_iv_z'
  | 'missing_vrp_20_and_iv_z'
  | 'below_vrp_threshold'
  | 'below_iv_z_threshold'
  | 'below_vrp_and_iv_z_threshold'
  | 'below_composite_threshold'
  | 'passed_thresholds_but_outside_top_n';

export interface RankedFeature extends FeatureSet {
  rank: number;
  selected: boolean;
  vrp_percentile: number;
  iv_z_percentile: number;
  selection_reason: SelectionReason;
}

@Injectable()
export class CalculationService {
  private readonly logger = new Logger(CalculationService.name);
  private static readonly MIN_IV_HISTORY_OBSERVATIONS = 20;

  /**
   * Extract ATM IV from options chain.
   * Finds options closest to the current price with nearest expiration (20-45 DTE).
   */
  extractAtmIv(options: OptionContract[], currentPrice: number): number | null {
    if (!options.length || !currentPrice) return null;

    const now = new Date();
    // Filter to options with valid IV and 15-50 DTE range.
    // We only use matched call/put pairs at the same strike and expiration.
    const validOptions = options.filter((opt) => {
      if (!opt.implied_volatility || opt.implied_volatility <= 0) return false;
      const expDate = new Date(opt.expiration_date);
      const dte = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return dte >= 15 && dte <= 50;
    });

    if (!validOptions.length) return null;

    const grouped = new Map<
      string,
      { call?: OptionContract; put?: OptionContract }
    >();
    for (const option of validOptions) {
      const key = `${option.expiration_date}:${option.strike_price}`;
      const existing = grouped.get(key) ?? {};
      existing[option.contract_type] = option;
      grouped.set(key, existing);
    }

    const pairCandidates = [...grouped.values()]
      .filter((entry): entry is { call: OptionContract; put: OptionContract } =>
        Boolean(entry.call && entry.put),
      )
      .map((entry) => {
        const expiration = new Date(entry.call.expiration_date);
        const dte =
          (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return {
          call: entry.call,
          put: entry.put,
          dte,
          distance: Math.abs(entry.call.strike_price - currentPrice),
          combinedOpenInterest:
            (entry.call.open_interest ?? 0) + (entry.put.open_interest ?? 0),
        };
      })
      .sort((left, right) => {
        if (left.dte !== right.dte) {
          return left.dte - right.dte;
        }
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return right.combinedOpenInterest - left.combinedOpenInterest;
      });

    const bestPair = pairCandidates[0];
    if (!bestPair) return null;

    const atmIv =
      ((bestPair.call.implied_volatility as number) +
        (bestPair.put.implied_volatility as number)) /
      2;
    return Math.round(atmIv * 10000) / 10000; // 4 decimal places
  }

  /**
   * Calculate historical (realized) volatility from daily close prices.
   * Uses log returns and annualizes.
   */
  calculateHistoricalVolatility(
    bars: DailyBar[],
    period: number,
  ): number | null {
    if (bars.length < period + 1) return null;

    // Use the most recent 'period + 1' bars to get 'period' returns
    const recentBars = bars.slice(-(period + 1));
    const logReturns: number[] = [];

    for (let i = 1; i < recentBars.length; i++) {
      const prev = recentBars[i - 1].c;
      const curr = recentBars[i].c;
      if (prev > 0 && curr > 0) {
        logReturns.push(Math.log(curr / prev));
      }
    }

    if (logReturns.length < period * 0.8) return null; // Need at least 80% of data

    const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
    const variance =
      logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (logReturns.length - 1);
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252);

    return Math.round(annualizedVol * 10000) / 10000;
  }

  calculateIvZScoreFromHistory(
    currentIv: number,
    historicalIvs: number[],
  ): number | null {
    if (!currentIv) return null;

    const observedIvs = historicalIvs.filter(
      (iv) => Number.isFinite(iv) && iv > 0,
    );
    if (observedIvs.length < CalculationService.MIN_IV_HISTORY_OBSERVATIONS) {
      return null;
    }

    const mean =
      observedIvs.reduce((sum, value) => sum + value, 0) / observedIvs.length;
    const variance =
      observedIvs.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      Math.max(observedIvs.length - 1, 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev <= 0) return null;

    const zScore = (currentIv - mean) / stdDev;
    return Math.round(zScore * 10000) / 10000;
  }

  /**
   * Compute all features for a symbol given its options and price data.
   */
  computeFeatures(
    symbol: string,
    options: OptionContract[],
    currentPrice: number,
    historicalBars: DailyBar[],
    historicalIvs: number[],
    currentIvForZScore?: number | null,
  ): FeatureSet {
    const atm_iv = this.extractAtmIv(options, currentPrice);
    const hv_10 = this.calculateHistoricalVolatility(historicalBars, 10);
    const hv_20 = this.calculateHistoricalVolatility(historicalBars, 20);
    const hv_60 = this.calculateHistoricalVolatility(historicalBars, 60);

    const vrp_20 =
      atm_iv !== null && hv_20 !== null
        ? Math.round((atm_iv - hv_20) * 10000) / 10000
        : null;
    const ivZBasis = currentIvForZScore ?? atm_iv;
    const iv_z =
      ivZBasis !== null && ivZBasis !== undefined
        ? this.calculateIvZScoreFromHistory(ivZBasis, historicalIvs)
        : null;

    return { symbol, atm_iv, hv_10, hv_20, hv_60, vrp_20, iv_z };
  }

  /**
   * Compute percentile of a value within an array.
   */
  percentile(value: number, values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.filter((v) => v < value).length;
    return (rank / sorted.length) * 100;
  }

  /**
   * Rank and select top candidates from feature sets.
   * Criteria: vrp20 >= 95th percentile AND iv_z >= 92.5th percentile
   */
  rankAndSelect(
    features: FeatureSet[],
    vrpThresholdPct: number = 95,
    ivZThresholdPct: number = 92.5,
    topN: number = 5,
  ): { ranked: RankedFeature[] } {
    // Filter to features with valid data
    const valid = features.filter((f) => f.vrp_20 !== null && f.iv_z !== null);

    if (!valid.length) {
      return { ranked: [] };
    }

    const vrpValues = valid.map((f) => f.vrp_20 as number);
    const ivZValues = valid.map((f) => f.iv_z as number);

    // Compute percentiles and sort by VRP descending
    const ranked = valid
      .map((f) => {
        const vrpPct = this.percentile(f.vrp_20 as number, vrpValues);
        const ivZPct = this.percentile(f.iv_z as number, ivZValues);
        return {
          ...f,
          rank: 0,
          selected: false,
          vrp_percentile: Math.round(vrpPct * 100) / 100,
          iv_z_percentile: Math.round(ivZPct * 100) / 100,
          selection_reason: 'below_vrp_and_iv_z_threshold' as SelectionReason,
        };
      })
      .sort((a, b) => (b.vrp_20 as number) - (a.vrp_20 as number));

    // Assign ranks
    ranked.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    // Select candidates meeting both thresholds
    const candidates = ranked.filter(
      (f) =>
        f.vrp_percentile >= vrpThresholdPct &&
        f.iv_z_percentile >= ivZThresholdPct,
    );

    // Mark top N as selected
    const topCandidates = candidates.slice(0, topN);
    for (const c of topCandidates) {
      c.selected = true;
    }

    for (const feature of ranked) {
      const passesVrpThreshold = feature.vrp_percentile >= vrpThresholdPct;
      const passesIvZThreshold = feature.iv_z_percentile >= ivZThresholdPct;

      feature.selection_reason = feature.selected
        ? 'selected'
        : passesVrpThreshold && passesIvZThreshold
          ? 'passed_thresholds_but_outside_top_n'
          : this.getThresholdFailureReason(
              passesVrpThreshold,
              passesIvZThreshold,
            );
    }

    return { ranked };
  }

  private getThresholdFailureReason(
    passesVrpThreshold: boolean,
    passesIvZThreshold: boolean,
  ): SelectionReason {
    if (!passesVrpThreshold && !passesIvZThreshold) {
      return 'below_vrp_and_iv_z_threshold';
    }
    if (!passesVrpThreshold) {
      return 'below_vrp_threshold';
    }

    return 'below_iv_z_threshold';
  }
}
