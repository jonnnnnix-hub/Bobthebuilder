import { CategoryScoreResult, SymbolScoringInput } from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  scaleBand,
  scaleLinear,
} from '../scoring_formulas.js';

function sma(values: number[], length: number): number | null {
  if (values.length < length) return null;
  const slice = values.slice(-length);
  return slice.reduce((sum, value) => sum + value, 0) / length;
}

export function scoreMomentumCategory(
  input: SymbolScoringInput,
): CategoryScoreResult {
  const closes = input.historicalBars.map((bar) => bar.c);
  const volumes = input.historicalBars.map((bar) => bar.v);

  const sma20 = sma(closes, 20);
  const currentClose = closes.length > 0 ? closes[closes.length - 1] : null;

  const priceMomentum =
    closes.length > 11 && currentClose !== null
      ? (currentClose / closes[closes.length - 11] - 1) * 100
      : null;

  const ivMomentum =
    input.historicalSignals.length > 5 &&
    input.atmIv !== null &&
    input.historicalSignals[4].atmIv !== null
      ? (input.atmIv / input.historicalSignals[4].atmIv - 1) * 100
      : null;

  const vol5 =
    volumes.length >= 5
      ? volumes.slice(-5).reduce((sum, value) => sum + value, 0) / 5
      : null;
  const vol20 =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((sum, value) => sum + value, 0) / 20
      : null;
  const volumeMomentum =
    vol5 !== null && vol20 !== null && vol20 > 0 ? vol5 / vol20 : null;

  const relativeStrength =
    sma20 !== null && currentClose !== null && sma20 > 0
      ? (currentClose / sma20 - 1) * 100
      : null;

  return categoryFromComponents('momentum', CATEGORY_MAX_POINTS.momentum, [
    {
      name: 'underlying_price_momentum',
      rawValue: priceMomentum,
      scaledScore: scaleLinear(priceMomentum, -8, 8, 8),
      maxPoints: 8,
      dataSource: 'market_bar.close',
    },
    {
      name: 'iv_momentum',
      rawValue: ivMomentum,
      scaledScore: scaleLinear(ivMomentum, -20, 25, 6),
      maxPoints: 6,
      dataSource: 'signal.atm_iv + signal_history.atm_iv',
    },
    {
      name: 'volume_momentum',
      rawValue: volumeMomentum,
      scaledScore: scaleLinear(volumeMomentum, 0.7, 1.8, 6),
      maxPoints: 6,
      dataSource: 'market_bar.volume',
    },
    {
      name: 'relative_strength',
      rawValue: relativeStrength,
      scaledScore: scaleBand(relativeStrength, [
        { min: -100, max: -3, score: 5 },
        { min: -3, max: 3, score: 3 },
        { min: 3, max: 100, score: 1 },
      ]),
      maxPoints: 5,
      dataSource: 'market_bar.close (vs SMA20)',
    },
  ]);
}
