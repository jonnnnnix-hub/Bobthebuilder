import { DailyBar, OptionContract } from '../polygon/polygon.service.js';

export type ScoreCategoryKey =
  | 'vrp'
  | 'ivz'
  | 'term'
  | 'skew'
  | 'momentum'
  | 'flow'
  | 'regime_risk';

export interface ScoreComponentResult {
  name: string;
  rawValue: number | null;
  scaledScore: number | null;
  maxPoints: number;
  dataSource: string;
  notes?: string;
}

export interface CategoryScoreResult {
  category: ScoreCategoryKey;
  score: number;
  maxPoints: number;
  availableMaxPoints: number;
  components: ScoreComponentResult[];
}

export interface CompositeConfidence {
  coverage: number;
  score: number;
  low: number;
  high: number;
}

export interface CompositeScoreResult {
  symbol: string;
  totalScore: number;
  totalMaxPoints: number;
  normalizedScore: number;
  confidence: CompositeConfidence;
  categories: Record<ScoreCategoryKey, CategoryScoreResult>;
}

export interface ScoreUniverseContext {
  vrpValues: number[];
  ivzValues: number[];
}

export interface HistoricalSignalPoint {
  date: Date;
  atmIv: number | null;
  vrp20: number | null;
  ivZ: number | null;
  compositeScore: number | null;
  normalizedScore: number | null;
}

export interface OptionSnapshotPoint {
  snapshotDate: Date;
  snapshotTs: Date;
  expiration: Date;
  strike: number;
  optionType: 'call' | 'put';
  impliedVolatility: number | null;
  delta: number | null;
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
}

export interface SymbolScoringInput {
  symbol: string;
  currentPrice: number;
  atmIv: number | null;
  hv20: number | null;
  vrp20: number | null;
  ivZ: number | null;
  vrpPercentile: number | null;
  ivZPercentile: number | null;
  historicalBars: DailyBar[];
  currentOptions: OptionContract[];
  historicalSignals: HistoricalSignalPoint[];
  optionSnapshots: OptionSnapshotPoint[];
  asOfDate: Date;
}

export interface ScoringConfig {
  topN: number;
  compositeThresholdPct: number;
}

export type CompositeSelectionReason =
  | 'selected'
  | 'missing_vrp_20'
  | 'missing_iv_z'
  | 'missing_vrp_20_and_iv_z'
  | 'below_composite_threshold'
  | 'passed_thresholds_but_outside_top_n';

export interface RankedCompositeScore extends CompositeScoreResult {
  rank: number | null;
  selected: boolean;
  selectionReason: CompositeSelectionReason;
}
