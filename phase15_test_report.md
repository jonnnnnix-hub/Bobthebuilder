# Phase 1.5 Autonomous Trading Engine — Local Test Report

**Project:** bobthebuilder  
**Scope:** Phase 1.5 validation before Phase 2  
**Date:** 2026-04-13  
**Tester:** Abacus AI Agent

## 1) Environment Setup

### Backend
- Installed backend deps: `corepack yarn install`
- Provisioned local PostgreSQL 15 on `localhost:5432`
- Created DB/user:
  - DB: `bobthebuilder`
  - User: `bob`
- Applied Prisma setup:
  - `corepack yarn db:generate`
  - `corepack yarn db:deploy`
  - `corepack yarn db:seed`
- Created backend `.env` with Alpaca paper credentials and local DB URL.

### Frontend
- Created frontend `.env`:
  - `VITE_API_URL=http://localhost:3000`
- Installed frontend deps: `npm install`

## 2) Unit Test Validation

### Full suite
Command:
```bash
cd nodejs_space && corepack yarn test --runInBand
```
Result:
- **17/17 suites passed**
- **88/88 tests passed**
- Includes:
  - `src/trading/decision-engine.service.spec.ts`
  - `src/trading/autonomous-risk.service.spec.ts`
  - `src/alpaca/alpaca.service.spec.ts`

### Focused Phase 1.5 subset
Command:
```bash
corepack yarn test src/trading/decision-engine.service.spec.ts src/trading/autonomous-risk.service.spec.ts src/alpaca/alpaca.service.spec.ts --runInBand
```
Result:
- **3/3 suites passed**
- **6/6 tests passed**

## 3) Integration Testing (Scenarios 1–5)

A dedicated runner executed scenarios and persisted results to:
- `/tmp/phase15_test_results.json`

### Scenario 1: Signal → Trade Decision Flow
Input setup:
- Mock selected signal on `AAPL`
- Composite score: **91**
- Confidence: **0.86**
- IV-Z: **2.3**, VRP: **0.19**
- Option chain snapshots with multiple expiries/strikes and liquidity

Observed:
- Strategy selected: **straddle**
- Expiration selected: **2026-05-08**, **24 DTE**
- Strike selection: **call 100 / put 100**
- Position sizing: **$1,995.20**, **1 contract**
- Risk evaluation: **approved** in isolated baseline context
- Decision rationale captured with category score breakdown and IV/VRP context

Status: **PASS** (engine produced full decision chain + rationale)

### Scenario 2: Risk Limit Enforcement
Input setup:
- Simulated existing exposure + dense position set
- New candidate with elevated heat and reduced liquidity score

Observed:
- Risk response: **blocked**
- Block reasons:
  - `portfolio delta 330.00 exceeds dynamic limit 175.00`
  - `liquidity score 0.300 below minimum 0.350`
- Risk metrics persisted in `risk_metrics` table
- Active position count in test fixture reached 10

Status: **PARTIAL PASS**
- Enforcement worked for delta/liquidity constraints.
- Requested checks for strict hard caps (`max positions=10`, `heat=40%`, `symbol concentration=5%`) are **not implemented as fixed hard limits** in current `AutonomousRiskService` logic (uses dynamic concentration/delta + liquidity).

### Scenario 3: Alpaca API Connection
Observed using provided paper credentials:
- Account fetch: **PASS**
  - Account status: `ACTIVE`
  - Equity: `100000`
  - Buying power: `199998`/`199999`
- Options chain for `AAPL`: API call succeeds but returned empty snapshot set in this run (`0` records)
- Test order placement: **PASS**
  - Limit order created (`pending_new`)
- Position fetch: **PASS** (0 open positions at test time)

Status: **PASS with note** (options snapshot endpoint returned empty data in this run)

### Scenario 4: Exit Logic
Observed trigger behavior:
- Profit target trigger fired at **+40%** input with threshold **0.35** (35%)
- Stop loss trigger fired at **-25%** threshold **-0.25**
- Time-based test at **7 DTE** returned **null** (no trigger)
- Score decay trigger fired for composite score **42** (<45)

Status: **PARTIAL PASS**
- Stop loss and score-decay logic behave as implemented.
- Current implementation differs from requested test spec:
  - Profit target implemented at **+35%** (not +40%)
  - Time-based trigger implemented at **<=3 DTE** (not 7 DTE)

### Scenario 5: Strategy Selection
Observed:
- High VRP case → **straddle** (not short premium in this test input)
- Negative VRP case → **long_call**
- High skew case → **long_put** (directional behavior)

Status: **PARTIAL PASS**
- Negative VRP and high skew behaviors align directionally.
- High VRP expectation from spec (short premium) did not match selected strategy for tested inputs.

## 4) End-to-End Backend Execution

### Autonomous loop behavior
- Backend started successfully on `127.0.0.1:3000`
- Scheduler processed selected signals and produced persisted `trade_decision` + `trading_log` records.
- Sample logs observed:
  - `MSFT: short_put blocked`
  - `AAPL: straddle blocked`
- `GET /api/trading/*` endpoints returned portfolio/risk/log payloads correctly.

### Analysis trigger behavior
Command:
```bash
POST /api/analysis/trigger (x-api-key: dev-cron-secret)
```
Observed:
- Run executed across universe but failed with 401s from Polygon due placeholder key.
- Terminal error: `Analysis produced no features for any active symbols`.

Status: **PASS for loop mechanics; BLOCKED for live analysis data path due market data credentials**

## 5) Frontend Testing (/trading)

- Frontend dev server started on `127.0.0.1:5173`
- `/trading` route loads and renders major UI components:
  - KPI cards
  - Open positions table
  - Manual Exit action buttons
- Data is fetched from backend and populated in UI during validated run.

Status: **PASS**

## 6) Issues Found

1. **Risk logic spec mismatch**
   - Requested fixed limits (positions=10, heat=40%, symbol=5%) are not enforced as hard checks in current autonomous risk evaluator.

2. **Exit policy mismatch with requested scenario**
   - Implemented thresholds are +35% profit target and <=3 DTE time trigger.
   - Requested test expected +40% and 7 DTE trigger.

3. **Strategy expectation mismatch for high VRP case**
   - High VRP test input selected `straddle` in current scoring heuristics, not short premium.

4. **Live analysis requires valid Polygon/ORATS credentials**
   - Placeholder keys cause analysis pipeline to fail for full-universe feature generation.

## 7) Readiness Assessment for Phase 2

### Overall assessment
- **Core Phase 1.5 engine functionality is working**:
  - decision engine
  - autonomous risk evaluation
  - Alpaca connectivity + order submission
  - trading APIs + frontend trading page
  - scheduled autonomous loop and decision logging

### Gate recommendation
- **Conditionally ready for Phase 2** with the following pre-Phase-2 cleanup:
  1. Align/confirm risk policy (dynamic vs fixed hard limits).
  2. Align/confirm exit thresholds (+35 vs +40, 3 DTE vs 7 DTE).
  3. Align/confirm strategy mapping expectation for high VRP inputs.
  4. Replace placeholder Polygon/ORATS credentials before full live E2E analysis validation.

## 8) Decision-Making Examples (Observed)

1. **AAPL high-score case**
   - Inputs: score 91, confidence 0.86, IV-Z 2.3, VRP 0.19
   - Output: `straddle`, 24 DTE, ATM-like strikes, $1,995 notional
   - Risk result: approved in isolated scenario; blocked in live loop under elevated portfolio delta

2. **Risk-blocked case**
   - Inputs: high existing delta exposure + low liquidity score candidate
   - Output: trade blocked with explicit reasons and persisted risk snapshot

3. **Exit reasoning case**
   - Score decay input (composite 42) produced `score_decay` exit signal rationale

---

## Appendix: Commands Used

```bash
# backend setup
corepack yarn install
corepack yarn db:generate
corepack yarn db:deploy
corepack yarn db:seed

# tests
corepack yarn test --runInBand
corepack yarn test src/trading/decision-engine.service.spec.ts src/trading/autonomous-risk.service.spec.ts src/alpaca/alpaca.service.spec.ts --runInBand

# backend run
corepack yarn start

# frontend run
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
