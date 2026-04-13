# Scoring Engine v2 Reference Guide (Phase 1)

## Overview

Scoring Engine v2 replaces the legacy dual-metric selector (VRP + IV Z) with a composite 200-point model.

```text
Total = VRP(30) + IV-Z(30) + Term Structure(30) + Skew(25) + Momentum(25) + Flow(25) + Regime & Risk(35)
```

All category scores are computed from persisted market/option observations and normalized onto a `0-100` composite scale.

## Inputs and data provenance

- `signal` features (`atm_iv`, `vrp_20`, `iv_z`, historical signal rows)
- `market_bar` (OHLCV history for momentum/regime/risk computations)
- `option_chain_snapshot` (IV slope, skew, flow, and liquidity metrics)
- ORATS IV history (primary source for IV-Z context when available)

If a required input for a sub-score is missing, the sub-score remains `null`, and the effective category max points are reduced accordingly.

## Category formulas (high-level)

All formulas use deterministic linear or piecewise-linear scaling in `src/scoring/scoring_formulas.ts`.

- **VRP (30):** magnitude, universe percentile, trend, stability
- **IV-Z (30):** current z-score, historical IV rank, universe percentile, regime context
- **Term Structure (30):** front/back IV slope, term-shape strength, calendar spread setup
- **Skew (25):** put/call skew, 25-delta skew proxy, skew-vs-history
- **Momentum (25):** price momentum, IV momentum, volume momentum, relative strength
- **Flow (25):** volume/open-interest pressure, put/call OI ratio, unusual activity, smart-money proxy
- **Regime & Risk (35):** market regime proxy, volatility/correlation proxy, liquidity, risk-adjusted opportunity

## Composite output fields

Stored on `signal`:

- `composite_score`
- `composite_score_normalized`
- `score_confidence`
- `confidence_low`
- `confidence_high`
- `score_version`
- `category_scores` (JSON object)

Transparency and history tables:

- `score_breakdown`: one row per sub-score
- `score_history`: per-signal persisted composite history snapshot

## Selection logic

`AnalysisService` now selects by:

1. Composite score normalization threshold (`composite_score_threshold_percentile`, default `70`)
2. Top-N cap (`top_n_candidates`)

Selection reasons now include:
- `selected`
- `below_composite_threshold`
- `passed_thresholds_but_outside_top_n`
- data-missing reasons (`missing_vrp_20`, etc.)

## Testing

- Unit tests cover all category calculators and composite ranking flow.
- Analysis integration tests verify persistence of composite scores + breakdown/history rows.
- Existing calculation tests remain for legacy metric calculations.
