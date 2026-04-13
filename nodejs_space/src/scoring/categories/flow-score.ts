import { CategoryScoreResult, SymbolScoringInput } from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  scaleLinear,
} from '../scoring_formulas.js';

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreFlowCategory(
  input: SymbolScoringInput,
): CategoryScoreResult {
  const rows = input.optionSnapshots;
  const totalVolume = rows.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const totalOpenInterest = rows.reduce(
    (sum, row) => sum + (row.openInterest ?? 0),
    0,
  );
  const putOpenInterest = rows
    .filter((row) => row.optionType === 'put')
    .reduce((sum, row) => sum + (row.openInterest ?? 0), 0);
  const callOpenInterest = rows
    .filter((row) => row.optionType === 'call')
    .reduce((sum, row) => sum + (row.openInterest ?? 0), 0);

  const dates = [
    ...new Set(rows.map((row) => row.snapshotDate.toISOString().slice(0, 10))),
  ].sort();
  const latestDate = dates.length > 0 ? dates[dates.length - 1] : null;
  const olderDates = dates.slice(
    Math.max(0, dates.length - 6),
    Math.max(0, dates.length - 1),
  );

  const latestRows =
    latestDate === null
      ? []
      : rows.filter(
          (row) => row.snapshotDate.toISOString().slice(0, 10) === latestDate,
        );
  const olderRows =
    olderDates.length === 0
      ? []
      : rows.filter((row) =>
          olderDates.includes(row.snapshotDate.toISOString().slice(0, 10)),
        );

  const latestVwapIv = average(
    latestRows
      .map((row) => (row.impliedVolatility ?? 0) * (row.volume ?? 0))
      .filter(Number.isFinite),
  );
  const olderVwapIv = average(
    olderRows
      .map((row) => (row.impliedVolatility ?? 0) * (row.volume ?? 0))
      .filter(Number.isFinite),
  );
  const ivShift =
    latestVwapIv !== null && olderVwapIv !== null
      ? latestVwapIv - olderVwapIv
      : null;

  const volumeToOi =
    totalOpenInterest > 0 ? totalVolume / totalOpenInterest : null;
  const putCallRatio =
    callOpenInterest > 0 ? putOpenInterest / callOpenInterest : null;
  const unusualActivity =
    rows.length > 0
      ? rows.filter(
          (row) =>
            (row.volume ?? 0) > 0 &&
            (row.openInterest ?? 0) > 0 &&
            (row.volume as number) > (row.openInterest as number),
        ).length / rows.length
      : null;
  const smartMoneyProxy =
    putCallRatio !== null && ivShift !== null
      ? putCallRatio * 0.6 + ivShift * 3
      : null;

  return categoryFromComponents('flow', CATEGORY_MAX_POINTS.flow, [
    {
      name: 'options_volume_vs_average',
      rawValue: volumeToOi,
      scaledScore: scaleLinear(volumeToOi, 0.02, 0.3, 7),
      maxPoints: 7,
      dataSource: 'option_chain_snapshot.volume/open_interest',
    },
    {
      name: 'put_call_ratio',
      rawValue: putCallRatio,
      scaledScore: scaleLinear(putCallRatio, 0.7, 1.8, 6),
      maxPoints: 6,
      dataSource: 'option_chain_snapshot.open_interest',
    },
    {
      name: 'unusual_options_activity',
      rawValue: unusualActivity,
      scaledScore: scaleLinear(unusualActivity, 0.01, 0.2, 6),
      maxPoints: 6,
      dataSource: 'option_chain_snapshot.volume/open_interest',
    },
    {
      name: 'smart_money_indicators',
      rawValue: smartMoneyProxy,
      scaledScore: scaleLinear(smartMoneyProxy, 0.3, 1.6, 6),
      maxPoints: 6,
      dataSource: 'derived(put_call_ratio + iv_shift)',
    },
  ]);
}
