import { NormalizedOptionQuote } from '../options-data/types.js';

export function buildOptionFixture(
  overrides: Partial<NormalizedOptionQuote> = {},
): NormalizedOptionQuote {
  return {
    underlyingSymbol: 'AAPL',
    optionSymbol: 'AAPL_2026-06-19_200_call',
    expiration: new Date('2026-06-19T00:00:00.000Z'),
    strike: 200,
    optionType: 'call',
    snapshotTs: new Date('2026-04-13T14:30:00.000Z'),
    bid: 4.9,
    ask: 5.1,
    mid: 5,
    last: 5,
    mark: 5,
    volume: 1200,
    openInterest: 8000,
    impliedVolatility: 0.32,
    delta: 0.42,
    gamma: 0.03,
    theta: -0.09,
    vega: 0.12,
    rho: 0.05,
    source: 'polygon',
    qualityFlags: [],
    ...overrides,
  };
}
