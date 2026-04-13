import {
  CategoryScoreResult,
  ScoreUniverseContext,
  SymbolScoringInput,
} from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  percentile,
  scaleLinear,
} from '../scoring_formulas.js';

export function scoreVrpCategory(
  input: SymbolScoringInput,
  context: ScoreUniverseContext,
): CategoryScoreResult {
  const historicalVrp = input.historicalSignals
    .map((point) => point.vrp20)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const latestVrp = historicalVrp.length > 0 ? historicalVrp[0] : null;
  const prevVrp = historicalVrp.length > 1 ? historicalVrp[1] : null;

  const vrpMagnitude = scaleLinear(input.vrp20, 0, 0.6, 10);

  const vrpUniversePct =
    input.vrpPercentile ?? percentile(input.vrp20, context.vrpValues);
  const vrpPercentileScore =
    vrpUniversePct === null
      ? null
      : vrpUniversePct < 75
        ? 0
        : scaleLinear(vrpUniversePct, 75, 100, 10);

  const vrpTrendRaw =
    latestVrp !== null && prevVrp !== null ? latestVrp - prevVrp : null;
  const vrpTrend = scaleLinear(vrpTrendRaw, 0, 0.12, 5);

  const mean =
    historicalVrp.length > 0
      ? historicalVrp.reduce((sum, value) => sum + value, 0) /
        historicalVrp.length
      : null;
  const std =
    mean !== null && historicalVrp.length > 1
      ? Math.sqrt(
          historicalVrp.reduce(
            (sum, value) => sum + Math.pow(value - mean, 2),
            0,
          ) /
            (historicalVrp.length - 1),
        )
      : null;
  const stabilityRaw =
    mean !== null && std !== null && Math.abs(mean) > 1e-6
      ? Math.max(0, 1 - std / Math.abs(mean))
      : null;
  const stability = scaleLinear(stabilityRaw, 0, 1, 5);

  return categoryFromComponents('vrp', CATEGORY_MAX_POINTS.vrp, [
    {
      name: 'vrp_magnitude',
      rawValue: input.vrp20,
      scaledScore: vrpMagnitude,
      maxPoints: 10,
      dataSource: 'signal.vrp_20',
    },
    {
      name: 'vrp_percentile',
      rawValue: vrpUniversePct,
      scaledScore: vrpPercentileScore,
      maxPoints: 10,
      dataSource: 'signal.vrp_percentile/universe_cross_section',
    },
    {
      name: 'vrp_trend',
      rawValue: vrpTrendRaw,
      scaledScore: vrpTrend,
      maxPoints: 5,
      dataSource: 'signal_history.vrp_20',
    },
    {
      name: 'vrp_stability',
      rawValue: stabilityRaw,
      scaledScore: stability,
      maxPoints: 5,
      dataSource: 'signal_history.vrp_20',
    },
  ]);
}
