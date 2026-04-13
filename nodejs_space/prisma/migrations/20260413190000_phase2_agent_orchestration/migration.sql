-- Phase 2: Agent Orchestration debate persistence

CREATE TABLE "agent_debate" (
  "id" BIGSERIAL PRIMARY KEY,
  "run_id" VARCHAR(80) NOT NULL,
  "signal_id" INTEGER NOT NULL,
  "symbol" VARCHAR(20) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'running',
  "consensus" VARCHAR(30),
  "consensus_strength" VARCHAR(30),
  "weighted_approval_pct" DECIMAL(8,4),
  "risk_vetoed" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "agent_opinion" (
  "id" BIGSERIAL PRIMARY KEY,
  "debate_id" BIGINT NOT NULL,
  "signal_id" INTEGER NOT NULL,
  "run_id" VARCHAR(80) NOT NULL,
  "agent_name" VARCHAR(80) NOT NULL,
  "round_number" INTEGER NOT NULL,
  "category_score" DECIMAL(10,4),
  "conviction" VARCHAR(20) NOT NULL,
  "thesis" TEXT NOT NULL,
  "key_risk" TEXT,
  "vote" VARCHAR(20) NOT NULL,
  "confidence_score" DECIMAL(6,4),
  "challenge_payload" JSONB,
  "response_payload" JSONB,
  "prompt_version" VARCHAR(20),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "debate_transcript" (
  "id" BIGSERIAL PRIMARY KEY,
  "debate_id" BIGINT NOT NULL,
  "round_number" INTEGER NOT NULL,
  "transcript" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "debate_transcript_debate_round_unique" UNIQUE ("debate_id", "round_number")
);

CREATE TABLE "consensus_result" (
  "id" BIGSERIAL PRIMARY KEY,
  "debate_id" BIGINT NOT NULL UNIQUE,
  "signal_id" INTEGER NOT NULL,
  "symbol" VARCHAR(20) NOT NULL,
  "final_decision" VARCHAR(30) NOT NULL,
  "consensus_strength" VARCHAR(30) NOT NULL,
  "weighted_approval_pct" DECIMAL(8,4),
  "confidence_adjusted_score" DECIMAL(14,6),
  "risk_vetoed" BOOLEAN NOT NULL DEFAULT false,
  "votes" JSONB NOT NULL,
  "key_thesis" TEXT,
  "key_risk" TEXT,
  "dissenting_views" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "agent_vote"
  ADD COLUMN "debate_id" BIGINT;

ALTER TABLE "agent_debate"
  ADD CONSTRAINT "agent_debate_signal_id_fkey"
  FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_opinion"
  ADD CONSTRAINT "agent_opinion_debate_id_fkey"
  FOREIGN KEY ("debate_id") REFERENCES "agent_debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_opinion"
  ADD CONSTRAINT "agent_opinion_signal_id_fkey"
  FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "debate_transcript"
  ADD CONSTRAINT "debate_transcript_debate_id_fkey"
  FOREIGN KEY ("debate_id") REFERENCES "agent_debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consensus_result"
  ADD CONSTRAINT "consensus_result_debate_id_fkey"
  FOREIGN KEY ("debate_id") REFERENCES "agent_debate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consensus_result"
  ADD CONSTRAINT "consensus_result_signal_id_fkey"
  FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_vote"
  ADD CONSTRAINT "agent_vote_debate_id_fkey"
  FOREIGN KEY ("debate_id") REFERENCES "agent_debate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_debate_signal_id_idx" ON "agent_debate"("signal_id");
CREATE INDEX "agent_debate_run_id_idx" ON "agent_debate"("run_id");
CREATE INDEX "agent_debate_status_created_at_idx" ON "agent_debate"("status", "created_at");
CREATE INDEX "agent_debate_symbol_created_at_idx" ON "agent_debate"("symbol", "created_at");

CREATE INDEX "agent_opinion_debate_id_round_number_idx" ON "agent_opinion"("debate_id", "round_number");
CREATE INDEX "agent_opinion_signal_id_idx" ON "agent_opinion"("signal_id");
CREATE INDEX "agent_opinion_agent_name_idx" ON "agent_opinion"("agent_name");

CREATE INDEX "debate_transcript_debate_id_idx" ON "debate_transcript"("debate_id");

CREATE INDEX "consensus_result_signal_id_idx" ON "consensus_result"("signal_id");
CREATE INDEX "consensus_result_symbol_created_at_idx" ON "consensus_result"("symbol", "created_at");
CREATE INDEX "consensus_result_final_decision_idx" ON "consensus_result"("final_decision");

CREATE INDEX "agent_vote_debate_id_idx" ON "agent_vote"("debate_id");
