CREATE TABLE "market_bar" (
  "id" SERIAL NOT NULL,
  "symbol" VARCHAR(20) NOT NULL,
  "date" DATE NOT NULL,
  "open" DOUBLE PRECISION NOT NULL,
  "high" DOUBLE PRECISION NOT NULL,
  "low" DOUBLE PRECISION NOT NULL,
  "close" DOUBLE PRECISION NOT NULL,
  "volume" BIGINT NOT NULL,
  "transactions" BIGINT,
  "source" VARCHAR(50) NOT NULL DEFAULT 'polygon_flat_file',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "market_bar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingestion_run" (
  "id" SERIAL NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "dataset" VARCHAR(100) NOT NULL,
  "target_date" DATE NOT NULL,
  "trigger" VARCHAR(20) NOT NULL DEFAULT 'manual',
  "status" VARCHAR(20) NOT NULL DEFAULT 'running',
  "rows_considered" INTEGER NOT NULL DEFAULT 0,
  "rows_ingested" INTEGER NOT NULL DEFAULT 0,
  "rows_skipped" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "errors" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_bar_symbol_date_key" ON "market_bar"("symbol", "date");
CREATE INDEX "market_bar_date_idx" ON "market_bar"("date");
CREATE INDEX "market_bar_symbol_date_idx" ON "market_bar"("symbol", "date");
CREATE INDEX "ingestion_run_provider_dataset_target_date_idx" ON "ingestion_run"("provider", "dataset", "target_date");
CREATE INDEX "ingestion_run_started_at_idx" ON "ingestion_run"("started_at");
CREATE INDEX "ingestion_run_status_idx" ON "ingestion_run"("status");

ALTER TABLE "market_bar"
ADD CONSTRAINT "market_bar_symbol_fkey"
FOREIGN KEY ("symbol") REFERENCES "universe"("symbol")
ON DELETE RESTRICT ON UPDATE CASCADE;
