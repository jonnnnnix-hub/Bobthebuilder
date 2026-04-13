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

export function scoreIvzCategory(
  input: SymbolScoringInput,
  context: ScoreUniverseContext,
): CategoryScoreResult {
  const ivRankSource = input.historicalSignals
    .map((point) => point.atmIv)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );

  const ivRank =
    input.atmIv !== null && ivRankSource.length > 0
      ? percentile(input.atmIv, ivRankSource)
      : null;
  const ivRankScore = ivRank === null ? null : scaleLinear(ivRank, 50, 100, 10);

  const ivUniversePct =
    input.ivZPercentile ?? percentile(input.ivZ, context.ivzValues);
  const ivUniverseScore =
    ivUniversePct === null
      ? null
      : ivUniversePct < 70
        ? 0
        : scaleLinear(ivUniversePct, 70, 100, 8);

  const historicalIvz = input.historicalSignals
    .map((point) => point.ivZ)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const meanIvz =
    historicalIvz.length > 0
      ? historicalIvz.reduce((sum, value) => sum + value, 0) /
        historicalIvz.length
      : null;
  const regimeDiff =
    input.ivZ !== null && meanIvz !== null ? input.ivZ - meanIvz : null;
  const regimeScore = scaleLinear(regimeDiff, -0.5, 1.5, 4);

  return categoryFromComponents('ivz', CATEGORY_MAX_POINTS.ivz, [
    {
      name: 'iv_z_current',
      rawValue: input.ivZ,
      scaledScore: scaleLinear(input.ivZ, -0.25, 3, 8),
      maxPoints: 8,
      dataSource: 'signal.iv_z',
    },
    {
      name: 'iv_rank_historical',
      rawValue: ivRank,
      scaledScore: ivRankScore,
      maxPoints: 10,
      dataSource: 'signal.atm_iv + signal_history.atm_iv',
    },
    {
      name: 'iv_universe_percentile',
      rawValue: ivUniversePct,
      scaledScore: ivUniverseScore,
      maxPoints: 8,
      dataSource: 'signal.iv_z_percentile/universe_cross_section',
    },
    {
      name: 'iv_regime_context',
      rawValue: regimeDiff,
      scaledScore: regimeScore,
      maxPoints: 4,
      dataSource: 'signal_history.iv_z',
    },
  ]);
}
