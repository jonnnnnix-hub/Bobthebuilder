ALTER TABLE "signal"
ADD COLUMN "vrp_percentile" DOUBLE PRECISION,
ADD COLUMN "iv_z_percentile" DOUBLE PRECISION,
ADD COLUMN "selection_reason" VARCHAR(100);
