CREATE TABLE "StrategyRunTrade" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "symbol" TEXT,
    "side" "TradeSide",
    "entryDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "entryPrice" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "shares" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "returnPct" DOUBLE PRECISION,
    "holdingPeriodDays" INTEGER,
    "exitReason" TEXT,
    "confidence" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "trailingStop" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRunTrade_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StrategyRunTrade" ADD CONSTRAINT "StrategyRunTrade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "StrategyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "StrategyRunTrade_runId_idx" ON "StrategyRunTrade"("runId");
CREATE INDEX "StrategyRunTrade_symbol_idx" ON "StrategyRunTrade"("symbol");
CREATE INDEX "StrategyRunTrade_exitReason_idx" ON "StrategyRunTrade"("exitReason");
CREATE INDEX "StrategyRunTrade_entryDate_idx" ON "StrategyRunTrade"("entryDate");
CREATE INDEX "StrategyRunTrade_exitDate_idx" ON "StrategyRunTrade"("exitDate");
