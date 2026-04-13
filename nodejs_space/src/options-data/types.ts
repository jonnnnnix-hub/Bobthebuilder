export type DataFreshnessTier = 'streaming' | 'intraday' | 'eod';

export type OptionsDataSource = 'polygon' | 'orats';

export type OptionType = 'call' | 'put';

export type QualityStatus = 'valid' | 'valid_with_warnings' | 'invalid';

export interface NormalizedOptionQuote {
  underlyingSymbol: string;
  optionSymbol: string;
  expiration: Date;
  strike: number;
  optionType: OptionType;
  snapshotTs: Date;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  mark: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  source: OptionsDataSource;
  qualityFlags: string[];
}

export interface OptionsProviderSnapshotResult {
  source: OptionsDataSource;
  quotes: NormalizedOptionQuote[];
  requestedAt: Date;
  warnings: string[];
}

export interface MergedOptionsSnapshot {
  underlyingSymbol: string;
  snapshotDate: Date;
  snapshotTs: Date;
  freshnessTier: DataFreshnessTier;
  mergedQuotes: NormalizedOptionQuote[];
  sourcesUsed: OptionsDataSource[];
  primarySource: OptionsDataSource;
  secondarySource: OptionsDataSource | null;
  qualitySummary: {
    valid: number;
    validWithWarnings: number;
    invalid: number;
  };
}

export function buildContractKey(input: {
  underlyingSymbol: string;
  expiration: Date;
  strike: number;
  optionType: OptionType;
}): string {
  return [
    input.underlyingSymbol.toUpperCase(),
    input.expiration.toISOString().slice(0, 10),
    input.strike.toFixed(4),
    input.optionType,
  ].join('|');
}
