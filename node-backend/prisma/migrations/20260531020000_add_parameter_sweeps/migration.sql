-- CreateTable
CREATE TABLE "StrategyParameterSweep" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rangesJson" JSONB,
    "rankingJson" JSONB,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyParameterSweep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyParameterSweepResult" (
    "id" TEXT NOT NULL,
    "sweepId" TEXT NOT NULL,
    "emaFast" INTEGER NOT NULL,
    "emaSlow" INTEGER NOT NULL,
    "rsiThreshold" DOUBLE PRECISION NOT NULL,
    "returnPct" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "expectancy" DOUBLE PRECISION,
    "cagr" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "tradeCount" INTEGER,
    "benchmarkReturn" DOUBLE PRECISION,
    "rank" INTEGER,
    "rankScore" DOUBLE PRECISION,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyParameterSweepResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyParameterSweep_experimentId_createdAt_idx" ON "StrategyParameterSweep"("experimentId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyParameterSweep_symbol_idx" ON "StrategyParameterSweep"("symbol");

-- CreateIndex
CREATE INDEX "StrategyParameterSweepResult_sweepId_rank_idx" ON "StrategyParameterSweepResult"("sweepId", "rank");

-- CreateIndex
CREATE INDEX "StrategyParameterSweepResult_sweepId_rankScore_idx" ON "StrategyParameterSweepResult"("sweepId", "rankScore");

-- CreateIndex
CREATE INDEX "StrategyParameterSweepResult_emaFast_emaSlow_rsiThreshold_idx" ON "StrategyParameterSweepResult"("emaFast", "emaSlow", "rsiThreshold");

-- AddForeignKey
ALTER TABLE "StrategyParameterSweep" ADD CONSTRAINT "StrategyParameterSweep_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyParameterSweepResult" ADD CONSTRAINT "StrategyParameterSweepResult_sweepId_fkey" FOREIGN KEY ("sweepId") REFERENCES "StrategyParameterSweep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
