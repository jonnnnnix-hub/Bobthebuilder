import { CategoryScoreResult, SymbolScoringInput } from '../interfaces.js';
import {
  CATEGORY_MAX_POINTS,
  categoryFromComponents,
  scaleBand,
  scaleLinear,
} from '../scoring_formulas.js';

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreRegimeRiskCategory(
  input: SymbolScoringInput,
): CategoryScoreResult {
  const closes = input.historicalBars.map((bar) => bar.c);
  const opens = input.historicalBars.map((bar) => bar.o);
  const volumes = input.historicalBars.map((bar) => bar.v);

  const returns = closes
    .slice(1)
    .map((close, index) => close / closes[index] - 1);
  const volatility =
    returns.length > 1
      ? Math.sqrt(
          returns.reduce(
            (sum, value) => sum + Math.pow(value - (average(returns) ?? 0), 2),
            0,
          ) /
            (returns.length - 1),
        ) * Math.sqrt(252)
      : null;

  const trendStrength =
    closes.length > 20
      ? Math.abs(closes[closes.length - 1] / closes[closes.length - 21] - 1)
      : null;
  const regimeScoreRaw =
    volatility !== null && trendStrength !== null
      ? trendStrength * 4 - volatility
      : null;

  const avgGap =
    opens.length > 1
      ? average(
          opens
            .slice(1)
            .map((open, index) => Math.abs(open / closes[index] - 1)),
        )
      : null;

  const spreadRows = input.optionSnapshots.filter(
    (row) => row.bid !== null && row.ask !== null && row.ask > row.bid,
  );
  const avgSpreadPct =
    spreadRows.length > 0
      ? average(
          spreadRows.map(
            (row) =>
              ((row.ask as number) - (row.bid as number)) /
              Math.max(row.ask as number, 1e-6),
          ),
        )
      : null;

  const dollarVolume =
    volumes.length > 0 && closes.length > 0
      ? average(
          volumes
            .slice(-20)
            .map(
              (vol, idx) => vol * closes[Math.max(0, closes.length - 20 + idx)],
            ),
        )
      : null;

  const riskAdjustedOpportunity =
    input.vrp20 !== null && volatility !== null && volatility > 0
      ? input.vrp20 / volatility
      : null;

  return categoryFromComponents(
    'regime_risk',
    CATEGORY_MAX_POINTS.regime_risk,
    [
      {
        name: 'market_regime_detection',
        rawValue: regimeScoreRaw,
        scaledScore: scaleBand(regimeScoreRaw, [
          { min: -100, max: -0.1, score: 2 },
          { min: -0.1, max: 0.25, score: 8 },
          { min: 0.25, max: 100, score: 10 },
        ]),
        maxPoints: 10,
        dataSource: 'market_bar.close',
      },
      {
        name: 'correlation_to_market_proxy',
        rawValue: volatility,
        scaledScore: scaleLinear(volatility, 0.1, 0.5, 7),
        maxPoints: 7,
        dataSource: 'market_bar.close (symbol volatility proxy)',
      },
      {
        name: 'liquidity_score',
        rawValue: avgSpreadPct,
        scaledScore:
          avgSpreadPct === null
            ? null
            : scaleLinear(1 - avgSpreadPct, 0.85, 0.99, 8),
        maxPoints: 8,
        dataSource: 'option_chain_snapshot.bid/ask + market_bar.volume',
        notes:
          dollarVolume !== null
            ? `avg_20d_dollar_volume=${dollarVolume.toFixed(2)}`
            : undefined,
      },
      {
        name: 'risk_adjusted_opportunity',
        rawValue: riskAdjustedOpportunity,
        scaledScore: scaleLinear(riskAdjustedOpportunity, -0.1, 1.2, 10),
        maxPoints: 10,
        dataSource: 'signal.vrp_20 + market_bar.close',
        notes: avgGap !== null ? `avg_gap_5d=${avgGap.toFixed(4)}` : undefined,
      },
    ],
  );
}
