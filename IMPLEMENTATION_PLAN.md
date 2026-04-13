# Bob the Builder — Frontend Redesign & Multi-Agent Backtesting Implementation Plan

Date: 2026-04-13

## 1) Executive Summary

The uploaded redesign document defines a major expansion from the current Phase 1/2 dashboard into a full research + governance platform for an options-only strategy. The target system requires:

- A 200+ point, seven-category composite scoring model
- A 10-agent, 3-round debate workflow with full transcript logging
- Real-data-only backtesting and iterative calibration loop
- Out-of-sample promotion criteria (>=90% win rate with additional guardrails)
- End-to-end auditability from raw inputs to trade outcomes
- Frontend support for score decomposition, consensus diagnostics, autopsies, and iteration history

Current implementation supports only a subset:
- Signal generation based on VRP + IV z percentile thresholds
- Basic research backtest on underlying spot returns (entry next open, exit later close)
- Existing frontend pages: Dashboard, Signals, Backtest, Universe, Runs

To satisfy the redesign, both backend and frontend require significant upgrades plus schema additions, especially for options-pricing-accurate backtesting and agent orchestration logs.

---

## 2) Redesign Requirements (Condensed)

### 2.1 Scoring & Selection

Implement a 0–230 composite score:

- A: Volatility Risk Premium (0–40)
- B: IV Z-Score (0–35)
- C: Term Structure & Skew (0–30)
- D: Technical Momentum (0–35)
- E: Options Flow & Positioning (0–30)
- F: Market Regime (0–30)
- G: Risk & Position Sizing (0–30)

Rules:
- Only real observed data
- Formula-driven scoring only (no arbitrary bonuses)
- Null handling with category-max reduction + threshold normalization
- Formula definitions centralized in `scoring_formulas.ts`

### 2.2 Multi-Agent Debate

10 specialist agents, 3 rounds:
1. Round 1 parallel independent assessments
2. Round 2 cross-examination and revised votes
3. Round 3 meta synthesis + consensus decision

Consensus logic includes select/pass/strong-select/hard-reject conditions and veto behavior.

### 2.3 Backtesting + Iterative Refinement

- Daily simulation pipeline with pre-filter optimization
- Metrics including win rate, Sharpe, profit factor, agent diagnostics, IS/OOS split
- Loss autopsy generation for every loser
- Iteration logs with bounded parameter changes
- Promotion gates and walk-forward validation

### 2.4 Frontend Expectations

Must support:
- Composite score visibility and category/sub-score drilldown
- Agent vote visualization and debate transcript access
- Backtest diagnostics (IS/OOS, threshold sensitivity, root causes)
- Iteration progression and promotion readiness status

---

## 3) Current State Assessment

## 3.1 Frontend (React + Vite)

Existing pages in `/frontend/src/pages`:
- `Dashboard.tsx`
- `Signals.tsx`
- `Backtest.tsx`
- `Universe.tsx`
- `Runs.tsx`

Current frontend capabilities:
- Displays latest run summary and selected symbols
- Displays table of basic signal metrics (VRP, IV z, percentiles)
- Displays basic backtest summary and trade table
- Displays universe and run history

Current frontend limitations vs redesign:
- No scoring category/sub-score views
- No agent debate UI
- No autopsy/iteration UI
- No confidence-adjusted scoring view
- No model calibration/control UX
- No options-chain analytics views (term/skew/flow)

## 3.2 Backend API & Services

Current APIs include:
- Analysis (`/api/analysis/*`)
- Signals (`/api/signals/*`)
- Research backtest (`/api/research/backtest`)
- Market coverage/ingestion (`/api/market/*`)
- Trades, positions, risk endpoints

Current signal engine (`analysis.service.ts` + `calculation.service.ts`):
- Computes ATM IV, HV10/20/60, VRP20, IV z
- Ranks by VRP and IV z percentiles
- Selects top-N that pass thresholds

Current research backtest (`research.service.ts`):
- Uses underlying bars only (entry open, exit close)
- Returns completed/open/missing-entry states
- Does NOT perform options contract-level P&L backtesting

Trade execution/positioning currently has approximations:
- Placeholder underlying price (`estimatedUnderlyingPrice = 100`) during leg generation
- Simplified strike estimation and mark estimation
- Not suitable for “exact options pricing” requirement

## 3.3 Database Schema

Current schema has:
- `signal`, `analysis_run`, `universe`, `market_bar`, `ingestion_run`
- `trade`, `trade_leg`, `position_snapshot`, `risk_check`, `configuration`

Missing for redesign:
- Backtest iteration entities (result snapshots, score breakdown, agent votes, autopsies, iteration logs)
- Persistent options chain snapshots by symbol/date/expiry/strike/right
- ORATS IV term/tenor history persistence for robust replay
- Debate transcript/audit models

---

## 4) Gap Analysis (What Exists vs What’s Needed)

### 4.1 Scoring Engine

Exists:
- Basic VRP + IV z framework

Needed:
- 7 categories, 200+ points
- Formula catalog + null-aware normalization
- Cross-sectional percentile utilities and configurable thresholds
- Category-level diagnostics and confidence-adjusted score

### 4.2 Agent Orchestration

Exists:
- None

Needed:
- Agent prompt templates, orchestrator, round transitions
- Vote/challenge schema + transcript persistence
- Deterministic replay with versioned prompts and params

### 4.3 Backtesting

Exists:
- Underlying-only proxy return model

Needed:
- Options pricing-accurate backtest based on real option data
- Contract lifecycle modeling (entry/exit per strategy and leg)
- IS/OOS split, walk-forward, iteration loop and convergence checks

### 4.4 Frontend

Exists:
- Operational monitoring UI for current signal flow

Needed:
- Research-grade analytics experience for scoring/debate/autopsy/iteration
- New pages and deep drilldown components
- Workflow support for calibration and promotion

### 4.5 Auditability / Governance

Exists:
- Basic run and signal records

Needed:
- Full evidence chain: raw data snapshot IDs -> formulas -> agent outputs -> consensus -> backtest result -> autopsy -> iteration decision

---

## 5) Detailed Phased Implementation Plan

## Phase 0 — Product/Quant Alignment (2–4 days)

Objectives:
- Lock definitions before coding to avoid rework

Tasks:
1. Confirm exact strategy scope (premium selling only? strategy types allowed?)
2. Confirm options data provider(s) for historical chains (Polygon only vs Polygon + vendor augmentation)
3. Confirm backtest fill assumptions (open/mid/close; slippage; commissions)
4. Confirm consensus thresholds and veto semantics
5. Freeze first version of metric definitions and promotion criteria

Deliverables:
- Signed-off spec delta document
- Formula dictionary v1

## Phase 1 — Data Foundation & Schema (1–1.5 weeks)

Backend tasks:
1. Add new tables (or Prisma models):
   - `backtest_result`
   - `score_breakdown`
   - `agent_vote`
   - `loss_autopsy`
   - `iteration_log`
   - `debate_transcript` (recommended addition)
   - `option_chain_snapshot` (required for accurate options backtesting)
   - `iv_surface_snapshot` / `orats_iv_daily` (recommended for reproducibility)
2. Add indices for symbol/date/run_id/iteration hot paths
3. Persist VIX and VIX3M into market data coverage scope
4. Add data quality flags (stale, partial, missing)

Frontend tasks:
- None (except loading placeholders for upcoming APIs)

Testing:
- Migration tests in staging DB
- Data integrity checks and uniqueness constraints

## Phase 2 — Scoring Engine v2 (1.5–2.5 weeks)

Backend tasks:
1. Create `scoring_formulas.ts` with explicit formulas and bounds
2. Implement all 7 categories and sub-scores with strict null propagation
3. Implement threshold normalization when sub-scores are null
4. Implement Stage 1/2/3 pre-filter pipeline
5. Add score explanation payloads for frontend

API tasks:
- New endpoints:
  - `GET /api/scoring/latest`
  - `GET /api/scoring/history`
  - `GET /api/scoring/:signalId/breakdown`

Testing:
- Unit tests for every formula
- Golden dataset regression tests
- Null/missing data behavior tests

## Phase 3 — Multi-Agent Debate System (1.5–2 weeks)

Backend tasks:
1. Build agent prompt catalog with versioning
2. Implement round orchestration:
   - Round 1 parallel
   - Round 2 sequential challenge/revise
   - Round 3 synthesis
3. Implement consensus policy engine and veto logic
4. Persist all agent outputs + full transcripts + prompt version IDs
5. Add deterministic replay endpoint by signal/run

API tasks:
- `GET /api/debate/:signalId`
- `GET /api/debate/:signalId/transcript`
- `POST /api/debate/replay`

Testing:
- Contract tests on JSON response schemas
- Replay determinism tests
- Failure-mode tests (API timeout/partial responses)

## Phase 4 — Options-Pricing-Accurate Backtesting (2–3 weeks)

Backend tasks:
1. Introduce options-centric backtest engine (not underlying proxy)
2. Define contract selection rules by strategy/date (expiry, strike, delta targeting)
3. Use real observed option prices for entry/exit (or nearest valid mark snapshot)
4. Add transaction cost model (commission + slippage) configurable
5. Keep status taxonomy for missing data: missing_entry_quote, missing_exit_quote, stale_chain
6. Compute expanded metrics from redesign spec

API tasks:
- `POST /api/backtest/iterate`
- `GET /api/backtest/runs`
- `GET /api/backtest/:id/metrics`
- `GET /api/backtest/:id/trades`

Testing:
- Backtest reproducibility tests
- Data-gap handling tests
- Baseline benchmark validation against manually checked samples

## Phase 5 — Iterative Refinement & Promotion Workflow (1–1.5 weeks)

Backend tasks:
1. Implement loss autopsy generator + root cause classifier
2. Implement bounded parameter tuning (<=3 changes per iteration)
3. Agent weighting recalibration by historical accuracy
4. Convergence checker for promotion readiness
5. Promotion endpoint and promoted-parameter snapshotting

API tasks:
- `GET /api/iterations`
- `GET /api/iterations/:n`
- `POST /api/backtest/promote`
- `GET /api/backtest/status`

Testing:
- Iteration log consistency tests
- Guardrail enforcement tests

## Phase 6 — Frontend Redesign Execution (2–3 weeks)

New pages/modules:
1. **Research Overview** (replace/enhance Dashboard)
   - Current iteration status
   - IS/OOS win rates, profit factor, score separation
   - Promotion gate checklist
2. **Signal Lab**
   - Composite score table
   - Category and sub-score drilldown
   - Null-data transparency indicators
3. **Debate Console**
   - Round timeline
   - Agent votes + confidence + revisions
   - Challenge graph and dissent summary
4. **Backtest Analytics**
   - Options-level trade outcomes
   - Threshold/horizon scenario comparison
   - Winners vs losers diagnostics
5. **Loss Autopsy Workbench**
   - Root-cause distributions
   - Trade-level autopsy cards
   - Proposed adjustment traceability
6. **Iteration Logbook**
   - Param change diffs
   - Metric deltas iteration-over-iteration
   - Stability/convergence indicators

Component tasks:
- Data grid upgrades for large result sets
- Shared chart primitives for category and agent diagnostics
- API client expansion with typed contracts
- Loading/error skeletons for expensive analytics endpoints

Testing:
- Component tests (sorting/filtering/rendering)
- Page integration tests
- API contract tests in CI

## Phase 7 — Integration Hardening, Release, and Monitoring (1 week)

Tasks:
1. CI pipeline updates for migration + unit + integration + lint
2. Feature flags for gradual rollout of scoring/debate UI
3. Operational telemetry (latency, data staleness, missing quote rates)
4. Runbook updates and rollback plan
5. Production smoke tests and post-deploy validation

---

## 6) Backend Enhancements Required (Explicit)

1. Replace current underlying-return research backtest with options pricing model
2. Add persistent option chain + quote snapshots for replayability
3. Add score breakdown persistence per signal and sub-score
4. Add agent output/transcript storage and retrieval APIs
5. Add iteration management APIs and promotion state APIs
6. Add richer diagnostics APIs for frontend (root causes, thresholds, agent accuracy)

---

## 7) Options Pricing Integration — Technical Considerations

## 7.1 Data Source Strategy

Minimum required dataset for exact-ish historical options backtesting:
- Option contract metadata: symbol, root, expiry, strike, right
- Daily (or finer) quote/mark snapshots: bid/ask/mid/last, volume, OI, IV, greeks if available
- Underlying bar/spot for sanity checks and fallback logic

Recommended primary source:
- Polygon options snapshots/chains with archival access

Recommended secondary source:
- ORATS for IV tenor history and/or surface features

## 7.2 Fill Logic (must be explicit and reproducible)

Pick one and version it:
- Conservative: enter at ask (buy) / bid (sell), exit opposite side
- Mid-price + slippage basis points
- Last-trade-only if quote absent (with quality warning)

Every fill decision should persist:
- quote timestamp
- quote source
- fill method version
- slippage/fees applied

## 7.3 Contract Selection Replay

For each signal:
- Persist exact selected contracts per leg at entry
- Persist mapping logic version (delta target, DTE target)
- Prevent future leakage by selecting with same-day close information only

## 7.4 Missing Data Policy

Do not synthesize prices.
When required quote missing:
- mark trade status explicitly
- exclude from win-rate denominator per policy
- include in data-quality metrics

---

## 8) Frontend Redesign Task Breakdown

1. Information architecture redesign and navigation update
2. New API hooks and normalized client-side data layer
3. Composite score visual system (category bars, sub-score tooltips)
4. Debate timeline and transcript explorer
5. Backtest analytics (distribution, confusion-like diagnostics)
6. Loss autopsy explorer and root-cause charts
7. Iteration log and promotion readiness dashboard
8. Permissions/feature flags for advanced controls
9. UX polish and responsive behavior

---

## 9) Remaining Items from Original Roadmap / Existing System

From current state and docs, remaining high-priority items include:

1. Eliminate placeholder pricing in trade creation and position marking
2. Replace simplified risk/greeks approximations with data-backed calculations
3. Expand E2E coverage beyond current limited path
4. Improve local/deploy DB workflow durability and reproducibility
5. Add explicit model/version metadata across scoring and strategy logic
6. Add operational monitoring for data freshness and pipeline health

---

## 10) Testing & Deployment Plan

## 10.1 Testing Layers

Backend:
- Formula unit tests (all sub-scores)
- Agent orchestration contract tests
- Backtest determinism tests
- Migration/integration tests with seeded historical slices

Frontend:
- Component tests for score/debate/autopsy widgets
- Page-level integration tests with mocked API
- Visual regression snapshots for key dashboards

System:
- End-to-end “one iteration” smoke run
- Performance/load test on candidate universe scale

## 10.2 Deployment

1. Deploy schema migrations first
2. Deploy backend with feature flags disabled by default
3. Backfill required options/IV data
4. Enable scoring v2 APIs
5. Deploy frontend redesign behind feature flag
6. Run shadow-mode iteration(s)
7. Enable production workflow after validation

---

## 11) Timeline Estimate

Assuming one focused full-stack engineer + one quant/research stakeholder + partial QA support:

- Phase 0: 0.5 week
- Phase 1: 1–1.5 weeks
- Phase 2: 1.5–2.5 weeks
- Phase 3: 1.5–2 weeks
- Phase 4: 2–3 weeks
- Phase 5: 1–1.5 weeks
- Phase 6: 2–3 weeks
- Phase 7: 1 week

Estimated total: **9.5 to 15 weeks**

With parallel workstreams (frontend + backend + quant), practical delivery can often be compressed toward the lower-middle of this range.

---

## 12) Clarifying Questions

### 12.1 Product & UX
1. Should the new UI prioritize a research workstation style (dense data) or executive dashboard style (simplified KPIs)?
2. Do you want Debate Console and Iteration Logbook as separate pages or a single “Research” workspace with tabs?
3. Should manual overrides (e.g., force pass/select) ever be allowed, or strictly no human override?

### 12.2 Options Data & Pricing
4. Which exact options data source should be the source of truth for historical entry/exit pricing (Polygon snapshots, trades, NBBO, ORATS, or hybrid)?
5. What fill policy should be official for backtests (mid, bid/ask conservative, configurable)?
6. Should commissions/fees/slippage be included now, and if yes, what default assumptions?

### 12.3 Metrics & Quant Definitions
7. Confirm win-rate denominator policy: completed trades only (as in redesign doc), correct?
8. For annualized Sharpe/profit factor, confirm return series granularity (per-trade vs daily portfolio).
9. Confirm whether score threshold calibration should optimize for win rate only, or a weighted objective (e.g., win rate + profit factor + sample size).

### 12.4 Agent Workflow
10. Is Anthropic model usage already approved/configured for all environments, including expected token/cost budgets?
11. Should agent prompts be editable via admin UI/config table, or code-versioned only?
12. Does Risk Manager veto always override even if consensus is strong, or only for specific risk classes?

### 12.5 Operations
13. What is the acceptable runtime per daily iteration/backtest job?
14. Do we need RBAC or audit logs for parameter changes/promotions?
15. Should promotion be automatic once criteria met, or always manual approval?

---

## 13) Recommended Immediate Next Steps

1. Answer clarifying questions (especially data source + fill policy + promotion governance)
2. Approve Phase 0/1 scope as first implementation milestone
3. Implement schema + data-persistence foundation before any UI-heavy work
4. Keep current frontend operational while new redesign is built behind feature flags

