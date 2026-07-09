CREATE TABLE "ValidationSignal" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "signal" "Signal" NOT NULL,
  "confidence" DOUBLE PRECISION,
  "scannerScore" DOUBLE PRECISION,
  "marketRegime" TEXT,
  "sector" TEXT,
  "openAiAdjustment" DOUBLE PRECISION,
  "newsAdjustment" DOUBLE PRECISION,
  "closePriceAtSignal" DOUBLE PRECISION,
  "backtestScore" DOUBLE PRECISION,
  "return1d" DOUBLE PRECISION,
  "return3d" DOUBLE PRECISION,
  "return5d" DOUBLE PRECISION,
  "return10d" DOUBLE PRECISION,
  "return20d" DOUBLE PRECISION,
  "maxDrawdown" DOUBLE PRECISION,
  "maxRunup" DOUBLE PRECISION,
  "winLoss" TEXT,
  "evaluatedAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ValidationSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ValidationSignal_symbol_timestamp_key" ON "ValidationSignal"("symbol", "timestamp");
CREATE INDEX "ValidationSignal_symbol_idx" ON "ValidationSignal"("symbol");
CREATE INDEX "ValidationSignal_timestamp_idx" ON "ValidationSignal"("timestamp");
CREATE INDEX "ValidationSignal_signal_idx" ON "ValidationSignal"("signal");
CREATE INDEX "ValidationSignal_sector_idx" ON "ValidationSignal"("sector");
CREATE INDEX "ValidationSignal_marketRegime_idx" ON "ValidationSignal"("marketRegime");
CREATE INDEX "ValidationSignal_evaluatedAt_idx" ON "ValidationSignal"("evaluatedAt");
