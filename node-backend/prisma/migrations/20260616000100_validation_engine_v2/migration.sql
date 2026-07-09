DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ValidationEvaluationStatus'
  ) THEN
    CREATE TYPE "ValidationEvaluationStatus" AS ENUM (
      'PENDING',
      'MATURED',
      'FAILED',
      'SKIPPED'
    );
  END IF;
END $$;

ALTER TABLE "ValidationSignal"
  ADD COLUMN IF NOT EXISTS "confidenceBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "market" TEXT,
  ADD COLUMN IF NOT EXISTS "exchange" TEXT,
  ADD COLUMN IF NOT EXISTS "strategyName" TEXT,
  ADD COLUMN IF NOT EXISTS "strategyId" TEXT,
  ADD COLUMN IF NOT EXISTS "horizon" TEXT,
  ADD COLUMN IF NOT EXISTS "entryPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "exitPrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "return60d" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actualReturn" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxReturn" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "minReturn" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "drawdown" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "evaluationVolatility" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "outcomeDirection" TEXT,
  ADD COLUMN IF NOT EXISTS "holdingDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "evaluationHorizon" TEXT,
  ADD COLUMN IF NOT EXISTS "evaluationStatus" "ValidationEvaluationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "evaluationError" TEXT;

UPDATE "ValidationSignal"
SET "confidenceBucket" = CASE
  WHEN COALESCE("confidence", 0) < 50 THEN '0-49'
  WHEN "confidence" < 60 THEN '50-59'
  WHEN "confidence" < 70 THEN '60-69'
  WHEN "confidence" < 80 THEN '70-79'
  WHEN "confidence" < 90 THEN '80-89'
  ELSE '90-100'
END
WHERE "confidenceBucket" IS NULL;

UPDATE "ValidationSignal"
SET
  "entryPrice" = COALESCE("entryPrice", "closePriceAtSignal"),
  "actualReturn" = COALESCE("actualReturn", "return5d", "return3d", "return1d", "return10d", "return20d"),
  "drawdown" = COALESCE("drawdown", "maxDrawdown"),
  "maxReturn" = COALESCE("maxReturn", "maxRunup"),
  "minReturn" = COALESCE("minReturn", "maxDrawdown"),
  "outcomeDirection" = COALESCE(
    "outcomeDirection",
    CASE
      WHEN "winLoss" = 'WIN' THEN 'UP'
      WHEN "winLoss" = 'LOSS' THEN 'DOWN'
      ELSE NULL
    END
  ),
  "evaluationHorizon" = COALESCE("evaluationHorizon", '5D'),
  "holdingDays" = COALESCE("holdingDays", 5),
  "evaluationStatus" = CASE
    WHEN "evaluatedAt" IS NOT NULL THEN 'MATURED'::"ValidationEvaluationStatus"
    ELSE "evaluationStatus"
  END;

CREATE TABLE IF NOT EXISTS "CalibrationMetric" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "horizon" TEXT NOT NULL,
  "predictedConfidence" DOUBLE PRECISION,
  "actualWinRate" DOUBLE PRECISION,
  "avgReturn" DOUBLE PRECISION,
  "medianReturn" DOUBLE PRECISION,
  "sampleCount" INTEGER NOT NULL,
  "calibrationError" DOUBLE PRECISION,
  "brierScore" DOUBLE PRECISION,
  "confidenceInterval" JSONB,
  "evidenceScore" TEXT NOT NULL,
  "supportingSignalIds" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalibrationMetric_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CalibrationMetric_userId_fkey'
  ) THEN
    ALTER TABLE "CalibrationMetric"
      ADD CONSTRAINT "CalibrationMetric_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ValidationSignal_userId_evaluationStatus_timestamp_idx"
  ON "ValidationSignal"("userId", "evaluationStatus", "timestamp");
CREATE INDEX IF NOT EXISTS "ValidationSignal_confidenceBucket_idx"
  ON "ValidationSignal"("confidenceBucket");
CREATE INDEX IF NOT EXISTS "ValidationSignal_exchange_idx"
  ON "ValidationSignal"("exchange");
CREATE INDEX IF NOT EXISTS "ValidationSignal_strategyName_idx"
  ON "ValidationSignal"("strategyName");
CREATE INDEX IF NOT EXISTS "ValidationSignal_horizon_idx"
  ON "ValidationSignal"("horizon");
CREATE INDEX IF NOT EXISTS "CalibrationMetric_userId_generatedAt_idx"
  ON "CalibrationMetric"("userId", "generatedAt");
CREATE INDEX IF NOT EXISTS "CalibrationMetric_userId_dimension_bucket_horizon_idx"
  ON "CalibrationMetric"("userId", "dimension", "bucket", "horizon");
