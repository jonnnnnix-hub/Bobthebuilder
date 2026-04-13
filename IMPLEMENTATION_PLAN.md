# Bob the Builder — Frontend Redesign & Multi-Agent Backtesting Implementation Plan

Date: 2026-04-13

## 1) Executive Summary

This plan updates the redesign roadmap using the finalized product decisions and starts implementation of Phase 0 data foundation work.

The target system remains:

- 0–230 composite scoring across seven categories
- 10-agent, 3-round debate workflow with replayable transcripts
- Real-data-only options backtesting with exact contract-level fill bookkeeping
- Iterative model calibration with promotion governance
- Auditability from raw market snapshots to iteration decisions

## 2) User Preferences (Locked)

1. **Data Source**: Hybrid options data strategy using **Polygon + ORATS** for maximum coverage.
2. **Fill Policy**: Support both **configurable slippage** and a **market impact model**.
3. **Governance**: **Hybrid** — system auto-suggests, human manually approves promotions.
4. **UX Density**: **Balanced** — clean top-level experience with deep drill-downs.
5. **Historical Depth**: Ingest and retain **as much provider history as available**.
6. **LLM Provider**: Use **Abacus.AI APIs** for agent orchestration.
7. **Update Frequency**: **Real-time streaming preferred**, with fallback to intraday snapshots and finally end-of-day.
8. **Priority**: Expand automated testing with stronger **unit + integration + E2E** coverage.

These choices are now considered the implementation baseline.

---

## 3) Architecture Decisions Derived from Preferences

### 3.1 Dual Data Source Strategy (Polygon + ORATS)

- Introduce a provider-agnostic options data interface (`OptionsDataProvider`).
- Implement concrete providers:
  - `PolygonOptionsProvider` (quote + chain snapshots)
  - `OratsOptionsProvider` (chain enrichments, IV/Greeks fields when present)
- Build an orchestrator (`OptionsDataFacade`) to:
  - request both sources in priority order,
  - merge contract rows by contract key (`symbol + expiration + strike + right`),
  - attach source provenance and quality diagnostics,
  - apply fallback if one provider is stale, partial, or unavailable.

### 3.2 Real-Time Streaming with Fallback Tiers

Use a three-tier data freshness strategy:

1. **Tier A: Streaming-first**
   - Consume near-real-time options updates where available.
   - Persist snapshots with capture timestamp and source metadata.
2. **Tier B: Intraday pull fallback**
   - If streaming is unavailable, poll periodic snapshots (configurable cadence).
3. **Tier C: End-of-day fallback**
   - If intraday feeds fail, ingest end-of-day chains and mark lower freshness grade.

Each stored snapshot carries:
- `freshness_tier`: `streaming | intraday | eod`
- `source_primary`, `source_secondary`
- `quality_flags`: stale/missing-fields/crossed-market/outlier

### 3.3 Fill Policy Configuration

Fill simulation must be versioned and replayable:

- `fill_policy_config` stores slippage basis points, spread participation rate, impact coefficients, fee assumptions, and enabled policy mode.
- Backtest results persist the **exact policy version** used for each simulated trade.

### 3.4 Testing-First Delivery

Every phase must include tests before completion criteria are met:

- Schema migration tests
- Service unit tests (provider merge, validation, fallback routing)
- Ingestion integration tests with fixture chains
- Controller/API e2e smoke coverage for new endpoints as they are introduced

---

## 4) Phased Implementation Plan (Refined)

## Phase 0 — Data Foundation Bootstrap (in progress)

### Scope

Deliver the minimum platform primitives needed for accurate, reproducible options research.

### Deliverables

1. Prisma models and migrations for:
   - `option_chain_snapshot`
   - `backtest_result`
   - `agent_vote`
   - `loss_autopsy`
   - `model_iteration`
   - `fill_policy_config`
2. Provider abstraction and dual-source fetchers (Polygon + ORATS).
3. Merge + fallback strategy with quality validation and provenance.
4. Historical options ingestion service + backfill scripts.
5. Testing infrastructure additions:
   - options fixtures
   - unit tests for data validation/merge/fallback
   - e2e expansion scaffolding

### Exit Criteria

- New schema migrated successfully.
- Ingestion can backfill historical option chains for a symbol/date range.
- Data quality metrics produced per ingestion run.
- Tests pass in CI profile for touched modules.

## Phase 1 — Scoring Engine v2

- Implement full 7-category score decomposition (0–230).
- Add null-aware normalization and threshold adjustment.
- Persist score breakdowns and expose diagnostics endpoints.
- Add golden dataset tests for formula regressions.

## Phase 2 — Multi-Agent Debate (Abacus.AI)

- Integrate Abacus.AI-backed agent orchestration.
- Implement 3-round debate with revision and veto semantics.
- Persist per-agent votes, confidence, explanations, and transcripts.
- Add deterministic replay tests and transcript integrity checks.

## Phase 3 — Options-Accurate Backtesting

- Replace underlying-return proxy with contract-level options P&L simulation.
- Use real observed quote snapshots from `option_chain_snapshot`.
- Apply versioned fill policy with configurable slippage + impact model.
- Persist run-level and trade-level diagnostics in `backtest_result`.

## Phase 4 — Loss Autopsy + Iteration Governance

- Generate autopsy records for losing trades.
- Track parameter changes and model revisions in `model_iteration`.
- Enforce hybrid governance: auto-suggest, manual approve.
- Add promotion-readiness checks and audit trails.

## Phase 5 — Frontend Redesign Execution

- Balanced UX: summary-first pages with drill-down diagnostics.
- New surfaces for scoring, debate, autopsy, and iteration lifecycle.
- Add contract-level backtest visualization and quality badges.
- Expand UI tests and API contract checks.

## Phase 6 — Hardening and Release

- CI pipeline for migration + unit + integration + e2e.
- Feature-flag rollout for new data and debate capabilities.
- Data freshness and quality telemetry.
- Release runbooks and rollback procedures.

---

## 5) Detailed Technical Plan for Dual-Source Options Data

### 5.1 Canonical Contract Key

Use deterministic key:

`underlying_symbol + expiration_date + strike + option_type`

with normalized symbol and date formatting.

### 5.2 Merge Rules

For each canonical contract row:

- Prefer freshest timestamp.
- If both fresh, apply per-field source priority:
  - bid/ask/last/volume: Polygon preferred
  - iv/greeks/open_interest: ORATS preferred (fallback Polygon)
- Keep both raw source payload references for audits.

### 5.3 Validation Rules

Reject or flag records when:

- bid/ask negative
- ask < bid (crossed market)
- IV outside configured bounds (default 0.01–5.00)
- expiration in past for snapshot date
- strike non-positive

Quality status per record:

- `valid`
- `valid_with_warnings`
- `invalid`

### 5.4 Fallback Sequence

1. Try primary provider call.
2. If timeout/4xx/5xx/empty-data threshold exceeded:
   - call secondary provider.
3. If both partially succeed:
   - merge and mark `partial_coverage`.
4. If both fail:
   - persist failed ingestion_run with error summary and retry hint.

---

## 6) Testing Plan (All Phases)

### 6.1 Unit

- Provider adapters (mapping correctness)
- Merge strategy conflict resolution
- Data quality validator edge cases
- Fill policy configuration parsing and defaulting

### 6.2 Integration

- Historical ingestion writes expected snapshot counts and quality flags
- Retry/fallback behavior when one provider fails
- Backfill chunking behavior for long date ranges

### 6.3 E2E

- API boot + health + core data endpoints
- New ingestion endpoint flow (trigger + status + persistence)
- Failure-path e2e for unauthorized/invalid parameter handling

### 6.4 Regression Coverage Gate

- Any schema-affecting PR requires:
  - migration checked in,
  - schema tests updated,
  - at least one e2e assertion covering the new domain path.

---

## 7) Immediate Next Build Steps

1. Finish Phase 0 schema + provider + ingestion implementation.
2. Add initial APIs for inspecting option snapshot coverage and ingestion runs.
3. Expand test fixtures for realistic option chains (including bad data cases).
4. Start score-breakdown persistence and scoring v2 contracts (Phase 1 kickoff).
