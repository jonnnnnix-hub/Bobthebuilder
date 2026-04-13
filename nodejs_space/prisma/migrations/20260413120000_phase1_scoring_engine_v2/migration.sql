-- Phase 1: Scoring Engine v2
-- Composite scoring fields on signal
ALTER TABLE "signal"
  ADD COLUMN IF NOT EXISTS "composite_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "composite_score_normalized" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "score_confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "confidence_low" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "confidence_high" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "score_version" VARCHAR(20) NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS "category_scores" JSONB;

CREATE INDEX IF NOT EXISTS "signal_composite_score_normalized_idx"
  ON "signal" ("composite_score_normalized");

-- Per-subscore transparency rows
CREATE TABLE IF NOT EXISTS "score_breakdown" (
  "id" BIGSERIAL PRIMARY KEY,
  "signal_id" INTEGER NOT NULL REFERENCES "signal"("id") ON DELETE CASCADE,
  "category" VARCHAR(40) NOT NULL,
  "sub_score_name" VARCHAR(80) NOT NULL,
  "raw_value" DECIMAL(14,6),
  "scaled_score" DECIMAL(14,6),
  "max_possible" DECIMAL(14,6) NOT NULL,
  "data_source" VARCHAR(60),
  "is_null" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "score_breakdown_signal_id_idx"
  ON "score_breakdown" ("signal_id");
CREATE INDEX IF NOT EXISTS "score_breakdown_category_idx"
  ON "score_breakdown" ("category");

-- Daily score history for trend tracking
CREATE TABLE IF NOT EXISTS "score_history" (
  "id" BIGSERIAL PRIMARY KEY,
  "signal_id" INTEGER NOT NULL UNIQUE REFERENCES "signal"("id") ON DELETE CASCADE,
  "symbol" VARCHAR(20) NOT NULL,
  "score_date" DATE NOT NULL,
  "run_id" VARCHAR(50) NOT NULL,
  "composite_score" DECIMAL(14,6),
  "normalized_score" DECIMAL(14,6),
  "confidence_score" DECIMAL(14,6),
  "confidence_low" DECIMAL(14,6),
  "confidence_high" DECIMAL(14,6),
  "category_scores" JSONB,
  "score_version" VARCHAR(20) NOT NULL DEFAULT 'v2',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "score_history_symbol_score_date_idx"
  ON "score_history" ("symbol", "score_date");
CREATE INDEX IF NOT EXISTS "score_history_run_id_idx"
  ON "score_history" ("run_id");
