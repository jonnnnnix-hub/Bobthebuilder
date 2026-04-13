import { CategoryScoreResult, SymbolScoringInput } from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  scaleLinear,
} from '../scoring_formulas.js';

export function scoreSkewCategory(
  input: SymbolScoringInput,
): CategoryScoreResult {
  const puts = input.optionSnapshots.filter(
    (row) => row.optionType === 'put' && row.impliedVolatility !== null,
  );
  const calls = input.optionSnapshots.filter(
    (row) => row.optionType === 'call' && row.impliedVolatility !== null,
  );

  const putIv =
    puts.length > 0
      ? puts.reduce((sum, row) => sum + (row.impliedVolatility ?? 0), 0) /
        puts.length
      : null;
  const callIv =
    calls.length > 0
      ? calls.reduce((sum, row) => sum + (row.impliedVolatility ?? 0), 0) /
        calls.length
      : null;
  const putCallSkew = putIv !== null && callIv !== null ? putIv - callIv : null;

  const put25 =
    puts
      .filter((row) => row.delta !== null)
      .sort(
        (a, b) =>
          Math.abs((a.delta ?? 0) + 0.25) - Math.abs((b.delta ?? 0) + 0.25),
      )[0]?.impliedVolatility ?? null;
  const call25 =
    calls
      .filter((row) => row.delta !== null)
      .sort(
        (a, b) =>
          Math.abs((a.delta ?? 0) - 0.25) - Math.abs((b.delta ?? 0) - 0.25),
      )[0]?.impliedVolatility ?? null;
  const strikeSkew = put25 !== null && call25 !== null ? put25 - call25 : null;

  const historicalSkewBase = input.historicalSignals
    .map((point) => point.vrp20)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const skewVsNorm =
    putCallSkew !== null && historicalSkewBase.length > 0
      ? putCallSkew -
        historicalSkewBase.reduce((sum, value) => sum + value, 0) /
          historicalSkewBase.length
      : null;

  return categoryFromComponents('skew', CATEGORY_MAX_POINTS.skew, [
    {
      name: 'put_call_skew',
      rawValue: putCallSkew,
      scaledScore: scaleLinear(putCallSkew, -0.02, 0.12, 9),
      maxPoints: 9,
      dataSource: 'option_chain_snapshot.implied_volatility',
    },
    {
      name: 'strike_skew_patterns',
      rawValue: strikeSkew,
      scaledScore: scaleLinear(strikeSkew, -0.03, 0.15, 8),
      maxPoints: 8,
      dataSource: 'option_chain_snapshot.delta + implied_volatility',
    },
    {
      name: 'skew_vs_historical_norms',
      rawValue: skewVsNorm,
      scaledScore: scaleLinear(skewVsNorm, -0.04, 0.1, 8),
      maxPoints: 8,
      dataSource: 'option_chain_snapshot + signal_history',
    },
  ]);
}
