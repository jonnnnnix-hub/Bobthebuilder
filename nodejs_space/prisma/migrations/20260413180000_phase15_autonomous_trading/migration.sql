-- Phase 1.5 Autonomous Trading Engine

CREATE TABLE "alpaca_account" (
  "id" BIGSERIAL PRIMARY KEY,
  "account_id" VARCHAR(80) NOT NULL UNIQUE,
  "status" VARCHAR(30) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "equity" DECIMAL(16,4),
  "cash" DECIMAL(16,4),
  "buying_power" DECIMAL(16,4),
  "daytrade_count" INTEGER,
  "raw_payload" JSONB,
  "synced_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "alpaca_account_synced_at_idx" ON "alpaca_account"("synced_at");

CREATE TABLE "trade_decision" (
  "id" BIGSERIAL PRIMARY KEY,
  "signal_id" INTEGER,
  "symbol" VARCHAR(20) NOT NULL,
  "composite_score" DECIMAL(14,6),
  "score_confidence" DECIMAL(14,6),
  "market_regime" VARCHAR(40),
  "volatility_environment" VARCHAR(40),
  "selected_strategy" VARCHAR(40) NOT NULL,
  "strategy_scoring" JSONB NOT NULL,
  "strike_selection" JSONB NOT NULL,
  "expiration_selection" JSONB NOT NULL,
  "position_size_usd" DECIMAL(14,4) NOT NULL,
  "position_contracts" INTEGER NOT NULL,
  "risk_state" VARCHAR(30) NOT NULL DEFAULT 'approved',
  "rationale" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "trade_decision_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "trade_decision_symbol_created_at_idx" ON "trade_decision"("symbol", "created_at");
CREATE INDEX "trade_decision_risk_state_idx" ON "trade_decision"("risk_state");
CREATE INDEX "trade_decision_signal_id_idx" ON "trade_decision"("signal_id");

CREATE TABLE "alpaca_order" (
  "id" BIGSERIAL PRIMARY KEY,
  "trade_decision_id" BIGINT,
  "alpaca_order_id" VARCHAR(120) UNIQUE,
  "client_order_id" VARCHAR(120),
  "symbol" VARCHAR(40) NOT NULL,
  "side" VARCHAR(10) NOT NULL,
  "order_type" VARCHAR(20) NOT NULL,
  "quantity" DECIMAL(14,4),
  "limit_price" DECIMAL(14,4),
  "stop_price" DECIMAL(14,4),
  "status" VARCHAR(30) NOT NULL,
  "filled_avg_price" DECIMAL(14,4),
  "filled_quantity" DECIMAL(14,4),
  "submitted_at" TIMESTAMPTZ,
  "filled_at" TIMESTAMPTZ,
  "request_payload" JSONB,
  "response_payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "alpaca_order_trade_decision_id_fkey" FOREIGN KEY ("trade_decision_id") REFERENCES "trade_decision"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "alpaca_order_symbol_created_at_idx" ON "alpaca_order"("symbol", "created_at");
CREATE INDEX "alpaca_order_status_idx" ON "alpaca_order"("status");
CREATE INDEX "alpaca_order_trade_decision_id_idx" ON "alpaca_order"("trade_decision_id");

CREATE TABLE "position_monitoring" (
  "id" BIGSERIAL PRIMARY KEY,
  "alpaca_position_id" VARCHAR(120),
  "symbol" VARCHAR(20) NOT NULL,
  "strategy" VARCHAR(40),
  "quantity" DECIMAL(14,4),
  "avg_entry_price" DECIMAL(14,4),
  "current_price" DECIMAL(14,4),
  "market_value" DECIMAL(16,4),
  "unrealized_pl" DECIMAL(16,4),
  "unrealized_pl_pct" DECIMAL(12,6),
  "realized_pl" DECIMAL(16,4),
  "delta" DECIMAL(14,6),
  "gamma" DECIMAL(14,6),
  "theta" DECIMAL(14,6),
  "vega" DECIMAL(14,6),
  "dte_remaining" INTEGER,
  "exit_criteria_status" JSONB,
  "last_synced_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "position_monitoring_symbol_last_synced_at_idx" ON "position_monitoring"("symbol", "last_synced_at");
CREATE INDEX "position_monitoring_alpaca_position_id_idx" ON "position_monitoring"("alpaca_position_id");

CREATE TABLE "exit_signal" (
  "id" BIGSERIAL PRIMARY KEY,
  "position_monitoring_id" BIGINT NOT NULL,
  "trigger_type" VARCHAR(40) NOT NULL,
  "trigger_value" DECIMAL(14,6),
  "threshold_value" DECIMAL(14,6),
  "action" VARCHAR(20) NOT NULL DEFAULT 'exit',
  "rationale" TEXT,
  "executed" BOOLEAN NOT NULL DEFAULT false,
  "executed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "exit_signal_position_monitoring_id_fkey" FOREIGN KEY ("position_monitoring_id") REFERENCES "position_monitoring"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "exit_signal_position_monitoring_id_created_at_idx" ON "exit_signal"("position_monitoring_id", "created_at");
CREATE INDEX "exit_signal_executed_idx" ON "exit_signal"("executed");

CREATE TABLE "risk_metrics" (
  "id" BIGSERIAL PRIMARY KEY,
  "portfolio_value" DECIMAL(16,4),
  "var_95" DECIMAL(16,4),
  "max_drawdown_pct" DECIMAL(12,6),
  "portfolio_heat_pct" DECIMAL(12,6),
  "max_symbol_concentration" DECIMAL(12,6),
  "max_sector_concentration" DECIMAL(12,6),
  "portfolio_delta" DECIMAL(14,6),
  "portfolio_gamma" DECIMAL(14,6),
  "portfolio_theta" DECIMAL(14,6),
  "portfolio_vega" DECIMAL(14,6),
  "liquidity_score" DECIMAL(12,6),
  "market_regime" VARCHAR(40),
  "metrics_payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "risk_metrics_created_at_idx" ON "risk_metrics"("created_at");

CREATE TABLE "trading_log" (
  "id" BIGSERIAL PRIMARY KEY,
  "level" VARCHAR(12) NOT NULL,
  "event_type" VARCHAR(40) NOT NULL,
  "symbol" VARCHAR(20),
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "trading_log_created_at_idx" ON "trading_log"("created_at");
CREATE INDEX "trading_log_event_type_idx" ON "trading_log"("event_type");
