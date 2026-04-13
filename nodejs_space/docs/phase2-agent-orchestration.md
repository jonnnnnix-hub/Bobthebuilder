# Phase 2 — Agent Orchestration System

## Agent roster (10 specialists)

1. VRP Specialist
2. Statistical Edge Analyst
3. Term Structure Specialist
4. Technical Momentum Analyst
5. Options Flow Analyst
6. Market Regime Analyst
7. Risk Manager (veto authority)
8. Contrarian Analyst
9. Historical Pattern Analyst
10. Meta-Strategist

## Debate workflow

### Round 1: Independent analysis (parallel)
- All specialists independently evaluate the same signal context.
- Each agent returns: thesis, key risk, vote, confidence, and category score.

### Round 2: Cross-examination
- Agents receive Round 1 opinions and can challenge/support peers.
- Contrarian is required to challenge the majority view.

### Round 3: Consensus building
- Agents produce final positions.
- Consensus engine aggregates weighted votes with confidence adjustment.
- Risk Manager can issue hard veto via `reject`.

## Consensus rules

- `select`: at least 6 select votes, weighted approval >= 70%, normalized score >= 70.
- `pass`: does not meet select criteria.
- `hard_reject`: Risk Manager reject vote in final round.

## Persistence model

- `agent_debate`: debate session lifecycle.
- `agent_opinion`: opinion rows for each round/agent.
- `debate_transcript`: round-level transcript JSON.
- `agent_vote`: per-agent vote log (extended with `debate_id`).
- `consensus_result`: final recommendation and rationale.

## Feature flag behavior

Phase 2 can be toggled without impacting execution path:
- Config key: `agent_debate_enabled` (`true`/`false`)
- Env fallback: `AGENT_DEBATE_ENABLED=true`
- Optional limit: `max_agent_debates_per_run` (default `10`)

When enabled, selected signals from analysis are debated before downstream consumers inspect recommendations.

## API endpoints

- `POST /api/agents/debate` — run debate for `signal_id`
- `GET /api/agents/debates/:id` — full transcript
- `GET /api/agents/debates` — list debates
- `GET /api/agents/stats` — aggregate vote metrics

## Frontend surfaces

Trading portal now includes **Agent Analysis**:
- Consensus card with recommendation and rationale
- Round 3 vote table
- Full transcript viewer across rounds
