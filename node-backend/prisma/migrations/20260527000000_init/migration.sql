-- CreateEnum
CREATE TYPE "Signal" AS ENUM ('BUY', 'HOLD', 'SELL');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED', 'FILLED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketRegime" TEXT,
    "riskMultiplier" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'scanner',
    "raw" JSONB,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "signal" "Signal" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "opportunityScore" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION,
    "rsi" DOUBLE PRECISION,
    "backtestReturn" DOUBLE PRECISION,
    "buyAndHoldReturn" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "drawdown" DOUBLE PRECISION,
    "sharpeRatio" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "expectancyPerTrade" DOUBLE PRECISION,
    "averageHoldingPeriodDays" DOUBLE PRECISION,
    "annualizedReturn" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "trades" INTEGER,
    "reasons" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "symbol" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "backtestReturn" DOUBLE PRECISION,
    "drawdown" DOUBLE PRECISION,
    "reasons" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "channel" TEXT,
    "raw" JSONB,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "orderType" "OrderType",
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "averagePrice" DOUBLE PRECISION NOT NULL,
    "lastPrice" DOUBLE PRECISION,
    "marketValue" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "sector" TEXT,
    "source" TEXT NOT NULL DEFAULT 'paper',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPerformance" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "symbol" TEXT,
    "strategyName" TEXT NOT NULL DEFAULT 'default',
    "totalReturn" DOUBLE PRECISION,
    "buyAndHoldReturn" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "sharpeRatio" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "expectancyPerTrade" DOUBLE PRECISION,
    "averageHoldingPeriodDays" DOUBLE PRECISION,
    "annualizedReturn" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "completedTrades" INTEGER,
    "period" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scan_generatedAt_idx" ON "Scan"("generatedAt");

-- CreateIndex
CREATE INDEX "Opportunity_symbol_idx" ON "Opportunity"("symbol");

-- CreateIndex
CREATE INDEX "Opportunity_signal_opportunityScore_idx" ON "Opportunity"("signal", "opportunityScore");

-- CreateIndex
CREATE INDEX "Opportunity_scanId_idx" ON "Opportunity"("scanId");

-- CreateIndex
CREATE INDEX "Alert_symbol_generatedAt_idx" ON "Alert"("symbol", "generatedAt");

-- CreateIndex
CREATE INDEX "Alert_scanId_idx" ON "Alert"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_symbol_key" ON "Watchlist"("symbol");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_openedAt_idx" ON "Trade"("openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_symbol_key" ON "Position"("symbol");

-- CreateIndex
CREATE INDEX "StrategyPerformance_symbol_idx" ON "StrategyPerformance"("symbol");

-- CreateIndex
CREATE INDEX "StrategyPerformance_strategyName_idx" ON "StrategyPerformance"("strategyName");

-- CreateIndex
CREATE INDEX "StrategyPerformance_scanId_idx" ON "StrategyPerformance"("scanId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPerformance" ADD CONSTRAINT "StrategyPerformance_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
