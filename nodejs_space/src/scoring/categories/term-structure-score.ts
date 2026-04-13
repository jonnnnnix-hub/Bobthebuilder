import {
  CategoryScoreResult,
  OptionSnapshotPoint,
  SymbolScoringInput,
} from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  scaleLinear,
} from '../scoring_formulas.js';

function nearestIvByWindow(
  rows: OptionSnapshotPoint[],
  optionType: 'call' | 'put',
  minDte: number,
  maxDte: number,
): number | null {
  const now = Date.now();
  const candidates = rows
    .filter(
      (row) => row.optionType === optionType && row.impliedVolatility !== null,
    )
    .map((row) => ({
      iv: row.impliedVolatility,
      dte: (row.expiration.getTime() - now) / (1000 * 60 * 60 * 24),
      distanceFromCenter: Math.abs(
        (row.expiration.getTime() - now) / (1000 * 60 * 60 * 24) -
          (minDte + maxDte) / 2,
      ),
    }))
    .filter((row) => row.dte >= minDte && row.dte <= maxDte)
    .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);

  return candidates[0]?.iv ?? null;
}

export function scoreTermStructureCategory(
  input: SymbolScoringInput,
): CategoryScoreResult {
  const rows = input.optionSnapshots;

  const frontIv = nearestIvByWindow(rows, 'call', 15, 35);
  const backIv = nearestIvByWindow(rows, 'call', 50, 90);
  const slope = frontIv !== null && backIv !== null ? frontIv - backIv : null;

  const avgSlopeHistory = input.historicalSignals
    .map((point) => point.atmIv)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const calendarSpreadRaw =
    slope !== null && avgSlopeHistory.length > 0
      ? slope -
        (avgSlopeHistory.reduce((sum, value) => sum + value, 0) /
          avgSlopeHistory.length -
          (input.atmIv ?? 0))
      : null;

  return categoryFromComponents('term', CATEGORY_MAX_POINTS.term, [
    {
      name: 'front_back_slope',
      rawValue: slope,
      scaledScore: scaleLinear(slope, -0.08, 0.1, 12),
      maxPoints: 12,
      dataSource: 'option_chain_snapshot.implied_volatility',
    },
    {
      name: 'term_shape_contango_backwardation',
      rawValue: slope,
      scaledScore: scaleLinear(slope, -0.05, 0.08, 10),
      maxPoints: 10,
      dataSource: 'option_chain_snapshot.implied_volatility',
    },
    {
      name: 'calendar_spread_opportunity',
      rawValue: calendarSpreadRaw,
      scaledScore: scaleLinear(calendarSpreadRaw, -0.03, 0.05, 8),
      maxPoints: 8,
      dataSource: 'option_chain_snapshot + signal_history',
    },
  ]);
}
