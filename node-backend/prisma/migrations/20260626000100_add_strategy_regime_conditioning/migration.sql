ALTER TABLE "Opportunity"
  ADD COLUMN "fitScore" DOUBLE PRECISION,
  ADD COLUMN "regimeAtSignal" TEXT,
  ADD COLUMN "sectorContext" TEXT,
  ADD COLUMN "instrumentType" TEXT;

ALTER TABLE "ValidationSignal"
  ADD COLUMN "fitScore" DOUBLE PRECISION,
  ADD COLUMN "regimeAtSignal" TEXT,
  ADD COLUMN "sectorContext" TEXT,
  ADD COLUMN "instrumentType" TEXT;

ALTER TABLE "StrategyRunTrade"
  ADD COLUMN "marketRegime" TEXT,
  ADD COLUMN "sectorContext" TEXT,
  ADD COLUMN "fitScore" DOUBLE PRECISION,
  ADD COLUMN "instrumentType" TEXT;

CREATE TABLE "MarketRegimeSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "regime" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'classifier',
  "indexTrend" DOUBLE PRECISION,
  "realizedVol" DOUBLE PRECISION,
  "breadth" DOUBLE PRECISION,
  "inputsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketRegimeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketRegimeSnapshot_userId_symbol_asOfDate_key"
  ON "MarketRegimeSnapshot"("userId", "symbol", "asOfDate");

CREATE INDEX "MarketRegimeSnapshot_userId_asOfDate_idx"
  ON "MarketRegimeSnapshot"("userId", "asOfDate");

CREATE INDEX "MarketRegimeSnapshot_userId_symbol_asOfDate_idx"
  ON "MarketRegimeSnapshot"("userId", "symbol", "asOfDate");

CREATE INDEX "MarketRegimeSnapshot_regime_idx"
  ON "MarketRegimeSnapshot"("regime");

CREATE INDEX "Opportunity_fitScore_idx"
  ON "Opportunity"("fitScore");

CREATE INDEX "Opportunity_regimeAtSignal_idx"
  ON "Opportunity"("regimeAtSignal");

CREATE INDEX "ValidationSignal_fitScore_idx"
  ON "ValidationSignal"("fitScore");

ALTER TABLE "MarketRegimeSnapshot"
  ADD CONSTRAINT "MarketRegimeSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
