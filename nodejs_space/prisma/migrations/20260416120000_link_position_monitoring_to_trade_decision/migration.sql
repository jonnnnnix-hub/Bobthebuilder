-- Link position_monitoring rows to the trade_decision that opened them.

ALTER TABLE "position_monitoring"
  ADD COLUMN "trade_decision_id" BIGINT,
  ADD CONSTRAINT "position_monitoring_trade_decision_id_fkey"
    FOREIGN KEY ("trade_decision_id") REFERENCES "trade_decision"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "position_monitoring_trade_decision_id_idx"
  ON "position_monitoring"("trade_decision_id");
