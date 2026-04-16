import type { StrategySelection } from '../alpaca/alpaca.types.js';

export interface StrikeSelectionResult {
  shortStrike?: number;
  longStrike?: number;
  callStrike?: number;
  putStrike?: number;
  expiration: string;
  dte: number;
  liquidityScore: number;
  rationale: string;
}

export interface ExpirationSelectionResult {
  expiration: string;
  dte: number;
  thetaEfficiency: number;
  liquidityScore: number;
  rationale: string;
}

export interface PositionSizingResult {
  notionalUsd: number;
  contracts: number;
  heatContributionPct: number;
  confidenceMultiplier: number;
  rationale: string;
}

export interface TradingDecision {
  signalId: number;
  symbol: string;
  strategy: StrategySelection;
  strikeSelection: StrikeSelectionResult;
  expirationSelection: ExpirationSelectionResult;
  positionSizing: PositionSizingResult;
  marketRegime: string;
  volatilityEnvironment: string;
  compositeScore: number;
  scoreConfidence: number;
  rationale: Record<string, unknown>;
}

export interface AccountSnapshot {
  status: string;
  equity: number;
  lastEquity: number | null;
}

export interface AccountSafetyCheck {
  safe: boolean;
  reasons: string[];
  snapshot: AccountSnapshot;
}
