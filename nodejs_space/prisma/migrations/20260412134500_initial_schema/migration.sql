-- CreateTable
CREATE TABLE "universe" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sector" VARCHAR(100),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "atm_iv" DOUBLE PRECISION,
    "hv_10" DOUBLE PRECISION,
    "hv_20" DOUBLE PRECISION,
    "hv_60" DOUBLE PRECISION,
    "vrp_20" DOUBLE PRECISION,
    "iv_z" DOUBLE PRECISION,
    "rank" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "run_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" SERIAL NOT NULL,
    "run_id" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "symbols_analyzed" INTEGER NOT NULL DEFAULT 0,
    "signals_generated" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "errors" TEXT,
    "duration_ms" INTEGER,
    "trigger" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" VARCHAR(500),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "universe_symbol_key" ON "universe"("symbol");

-- CreateIndex
CREATE INDEX "universe_active_idx" ON "universe"("active");

-- CreateIndex
CREATE INDEX "signal_date_idx" ON "signal"("date");

-- CreateIndex
CREATE INDEX "signal_selected_idx" ON "signal"("selected");

-- CreateIndex
CREATE INDEX "signal_run_id_idx" ON "signal"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "signal_symbol_date_run_id_key" ON "signal"("symbol", "date", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_run_id_key" ON "analysis_run"("run_id");

-- CreateIndex
CREATE INDEX "analysis_run_started_at_idx" ON "analysis_run"("started_at");

-- CreateIndex
CREATE INDEX "analysis_run_status_idx" ON "analysis_run"("status");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_key_key" ON "configuration"("key");

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "universe"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal" ADD CONSTRAINT "signal_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_run"("run_id") ON DELETE RESTRICT ON UPDATE CASCADE;
