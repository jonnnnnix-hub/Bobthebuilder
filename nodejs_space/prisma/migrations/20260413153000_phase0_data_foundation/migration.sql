-- CreateTable
CREATE TABLE "option_chain_snapshot" (
    "id" BIGSERIAL NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "snapshot_ts" TIMESTAMP(3) NOT NULL,
    "underlying_symbol" VARCHAR(20) NOT NULL,
    "option_symbol" VARCHAR(40) NOT NULL,
    "expiration" DATE NOT NULL,
    "strike" DECIMAL(12,4) NOT NULL,
    "option_type" VARCHAR(4) NOT NULL,
    "bid" DECIMAL(12,4),
    "ask" DECIMAL(12,4),
    "mid" DECIMAL(12,4),
    "last" DECIMAL(12,4),
    "mark" DECIMAL(12,4),
    "volume" INTEGER,
    "open_interest" INTEGER,
    "implied_volatility" DECIMAL(12,6),
    "delta" DECIMAL(12,6),
    "gamma" DECIMAL(12,6),
    "theta" DECIMAL(12,6),
    "vega" DECIMAL(12,6),
    "rho" DECIMAL(12,6),
    "source_primary" VARCHAR(40) NOT NULL,
    "source_secondary" VARCHAR(40),
    "freshness_tier" VARCHAR(20) NOT NULL DEFAULT 'intraday',
    "quality_status" VARCHAR(30) NOT NULL DEFAULT 'valid',
    "quality_flags" JSONB,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "option_chain_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_result" (
    "id" BIGSERIAL NOT NULL,
    "backtest_run_id" VARCHAR(80) NOT NULL,
    "signal_id" INTEGER,
    "trade_id" INTEGER,
    "symbol" VARCHAR(20) NOT NULL,
    "strategy" VARCHAR(40) NOT NULL,
    "entry_date" DATE NOT NULL,
    "exit_date" DATE,
    "status" VARCHAR(30) NOT NULL,
    "fill_policy_version" VARCHAR(40) NOT NULL,
    "entry_fill_details" JSONB NOT NULL,
    "exit_fill_details" JSONB,
    "legs" JSONB NOT NULL,
    "fees" DECIMAL(12,4),
    "slippage" DECIMAL(12,4),
    "gross_pnl" DECIMAL(14,4),
    "net_pnl" DECIMAL(14,4),
    "return_pct" DECIMAL(12,6),
    "max_drawdown_pct" DECIMAL(12,6),
    "quality_flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_vote" (
    "id" BIGSERIAL NOT NULL,
    "run_id" VARCHAR(80) NOT NULL,
    "signal_id" INTEGER,
    "model_iteration_id" BIGINT,
    "agent_name" VARCHAR(80) NOT NULL,
    "agent_role" VARCHAR(80),
    "round_number" INTEGER NOT NULL,
    "vote" VARCHAR(20) NOT NULL,
    "confidence_score" DECIMAL(6,4),
    "score" DECIMAL(10,4),
    "rationale" TEXT,
    "challenge_to" VARCHAR(80),
    "transcript" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_autopsy" (
    "id" BIGSERIAL NOT NULL,
    "backtest_result_id" BIGINT,
    "model_iteration_id" BIGINT,
    "symbol" VARCHAR(20) NOT NULL,
    "trade_date" DATE NOT NULL,
    "root_cause" VARCHAR(120) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "hypothesis" TEXT,
    "evidence" JSONB,
    "proposed_actions" JSONB,
    "confidence_score" DECIMAL(6,4),
    "reviewed_by" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_autopsy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_iteration" (
    "id" BIGSERIAL NOT NULL,
    "iteration_key" VARCHAR(80) NOT NULL,
    "parent_iteration_key" VARCHAR(80),
    "model_version" VARCHAR(80) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "objective" VARCHAR(120),
    "parameter_snapshot" JSONB NOT NULL,
    "parameter_diff" JSONB,
    "in_sample_metrics" JSONB,
    "out_of_sample_metrics" JSONB,
    "proposed_by" VARCHAR(40) NOT NULL DEFAULT 'system',
    "approved_by" VARCHAR(80),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_iteration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fill_policy_config" (
    "id" BIGSERIAL NOT NULL,
    "policy_name" VARCHAR(80) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "slippage_bps" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "commission_per_contract" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "impact_enabled" BOOLEAN NOT NULL DEFAULT true,
    "impact_coefficient" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "impact_exponent" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "spread_participation_rate" DECIMAL(10,6) NOT NULL DEFAULT 0.5,
    "min_fill_fraction" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fill_policy_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "option_chain_snapshot_snapshot_ts_option_symbol_source_primary_key" ON "option_chain_snapshot"("snapshot_ts", "option_symbol", "source_primary");

-- CreateIndex
CREATE INDEX "option_chain_snapshot_underlying_symbol_snapshot_date_idx" ON "option_chain_snapshot"("underlying_symbol", "snapshot_date");

-- CreateIndex
CREATE INDEX "option_chain_snapshot_underlying_symbol_expiration_strike_option_type_idx" ON "option_chain_snapshot"("underlying_symbol", "expiration", "strike", "option_type");

-- CreateIndex
CREATE INDEX "option_chain_snapshot_quality_status_snapshot_date_idx" ON "option_chain_snapshot"("quality_status", "snapshot_date");

-- CreateIndex
CREATE INDEX "backtest_result_backtest_run_id_idx" ON "backtest_result"("backtest_run_id");

-- CreateIndex
CREATE INDEX "backtest_result_symbol_entry_date_idx" ON "backtest_result"("symbol", "entry_date");

-- CreateIndex
CREATE INDEX "backtest_result_status_idx" ON "backtest_result"("status");

-- CreateIndex
CREATE INDEX "backtest_result_signal_id_idx" ON "backtest_result"("signal_id");

-- CreateIndex
CREATE INDEX "backtest_result_trade_id_idx" ON "backtest_result"("trade_id");

-- CreateIndex
CREATE INDEX "agent_vote_run_id_round_number_idx" ON "agent_vote"("run_id", "round_number");

-- CreateIndex
CREATE INDEX "agent_vote_agent_name_idx" ON "agent_vote"("agent_name");

-- CreateIndex
CREATE INDEX "agent_vote_signal_id_idx" ON "agent_vote"("signal_id");

-- CreateIndex
CREATE INDEX "agent_vote_model_iteration_id_idx" ON "agent_vote"("model_iteration_id");

-- CreateIndex
CREATE INDEX "loss_autopsy_symbol_trade_date_idx" ON "loss_autopsy"("symbol", "trade_date");

-- CreateIndex
CREATE INDEX "loss_autopsy_root_cause_idx" ON "loss_autopsy"("root_cause");

-- CreateIndex
CREATE INDEX "loss_autopsy_backtest_result_id_idx" ON "loss_autopsy"("backtest_result_id");

-- CreateIndex
CREATE INDEX "loss_autopsy_model_iteration_id_idx" ON "loss_autopsy"("model_iteration_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_iteration_iteration_key_key" ON "model_iteration"("iteration_key");

-- CreateIndex
CREATE INDEX "model_iteration_status_created_at_idx" ON "model_iteration"("status", "created_at");

-- CreateIndex
CREATE INDEX "model_iteration_model_version_idx" ON "model_iteration"("model_version");

-- CreateIndex
CREATE UNIQUE INDEX "fill_policy_config_policy_name_key" ON "fill_policy_config"("policy_name");

-- CreateIndex
CREATE UNIQUE INDEX "fill_policy_config_policy_name_version_key" ON "fill_policy_config"("policy_name", "version");

-- CreateIndex
CREATE INDEX "fill_policy_config_is_default_idx" ON "fill_policy_config"("is_default");

-- AddForeignKey
ALTER TABLE "backtest_result" ADD CONSTRAINT "backtest_result_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_result" ADD CONSTRAINT "backtest_result_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_vote" ADD CONSTRAINT "agent_vote_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_vote" ADD CONSTRAINT "agent_vote_model_iteration_id_fkey" FOREIGN KEY ("model_iteration_id") REFERENCES "model_iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_autopsy" ADD CONSTRAINT "loss_autopsy_backtest_result_id_fkey" FOREIGN KEY ("backtest_result_id") REFERENCES "backtest_result"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_autopsy" ADD CONSTRAINT "loss_autopsy_model_iteration_id_fkey" FOREIGN KEY ("model_iteration_id") REFERENCES "model_iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
