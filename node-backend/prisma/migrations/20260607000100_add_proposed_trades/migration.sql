CREATE TABLE "ProposedTrade" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "recommendation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "auditEvents" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposedTrade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposedTrade_symbol_idx" ON "ProposedTrade"("symbol");
CREATE INDEX "ProposedTrade_status_idx" ON "ProposedTrade"("status");
CREATE INDEX "ProposedTrade_manualOverride_idx" ON "ProposedTrade"("manualOverride");
CREATE INDEX "ProposedTrade_createdAt_idx" ON "ProposedTrade"("createdAt");
