-- CreateTable
CREATE TABLE "trade" (
    "id" SERIAL NOT NULL,
    "signal_id" INTEGER,
    "symbol" VARCHAR(20) NOT NULL,
    "strategy" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "direction" VARCHAR(10) NOT NULL DEFAULT 'sell',
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "entry_credit" DOUBLE PRECISION,
    "exit_debit" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "pnl_pct" DOUBLE PRECISION,
    "contracts" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_leg" (
    "id" SERIAL NOT NULL,
    "trade_id" INTEGER NOT NULL,
    "option_type" VARCHAR(10) NOT NULL,
    "strike" DOUBLE PRECISION NOT NULL,
    "expiration" DATE NOT NULL,
    "side" VARCHAR(10) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "entry_price" DOUBLE PRECISION,
    "exit_price" DOUBLE PRECISION,
    "iv_at_entry" DOUBLE PRECISION,
    "delta_at_entry" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_snapshot" (
    "id" SERIAL NOT NULL,
    "trade_id" INTEGER NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "underlying_price" DOUBLE PRECISION NOT NULL,
    "mark_value" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION,
    "theta" DOUBLE PRECISION,
    "vega" DOUBLE PRECISION,
    "gamma" DOUBLE PRECISION,
    "days_to_expiry" INTEGER NOT NULL,
    "pnl_unrealized" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_check" (
    "id" SERIAL NOT NULL,
    "trade_id" INTEGER,
    "check_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "message" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_symbol_idx" ON "trade"("symbol");

-- CreateIndex
CREATE INDEX "trade_status_idx" ON "trade"("status");

-- CreateIndex
CREATE INDEX "trade_signal_id_idx" ON "trade"("signal_id");

-- CreateIndex
CREATE INDEX "trade_leg_trade_id_idx" ON "trade_leg"("trade_id");

-- CreateIndex
CREATE INDEX "position_snapshot_trade_id_idx" ON "position_snapshot"("trade_id");

-- CreateIndex
CREATE INDEX "position_snapshot_snapshot_date_idx" ON "position_snapshot"("snapshot_date");

-- CreateIndex
CREATE INDEX "risk_check_trade_id_idx" ON "risk_check"("trade_id");

-- CreateIndex
CREATE INDEX "risk_check_check_type_idx" ON "risk_check"("check_type");

-- AddForeignKey
ALTER TABLE "trade" ADD CONSTRAINT "trade_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_leg" ADD CONSTRAINT "trade_leg_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_snapshot" ADD CONSTRAINT "position_snapshot_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_check" ADD CONSTRAINT "risk_check_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
