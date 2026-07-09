-- CreateTable
CREATE TABLE "StrategyExperiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "returnPct" DOUBLE PRECISION,
    "cagr" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "expectancy" DOUBLE PRECISION,
    "tradeCount" INTEGER,
    "benchmarkReturn" DOUBLE PRECISION,
    "period" TEXT,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyComparison" (
    "id" TEXT NOT NULL,
    "leftExperimentId" TEXT NOT NULL,
    "rightExperimentId" TEXT NOT NULL,
    "comparisonJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyExperiment_status_idx" ON "StrategyExperiment"("status");

-- CreateIndex
CREATE INDEX "StrategyExperiment_createdAt_idx" ON "StrategyExperiment"("createdAt");

-- CreateIndex
CREATE INDEX "StrategyRun_experimentId_createdAt_idx" ON "StrategyRun"("experimentId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyRun_period_idx" ON "StrategyRun"("period");

-- CreateIndex
CREATE INDEX "StrategyComparison_leftExperimentId_rightExperimentId_idx" ON "StrategyComparison"("leftExperimentId", "rightExperimentId");

-- CreateIndex
CREATE INDEX "StrategyComparison_createdAt_idx" ON "StrategyComparison"("createdAt");

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyComparison" ADD CONSTRAINT "StrategyComparison_leftExperimentId_fkey" FOREIGN KEY ("leftExperimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyComparison" ADD CONSTRAINT "StrategyComparison_rightExperimentId_fkey" FOREIGN KEY ("rightExperimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
