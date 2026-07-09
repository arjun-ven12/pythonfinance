CREATE TABLE "WalkForwardRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "trainStart" TIMESTAMP(3),
    "trainEnd" TIMESTAMP(3),
    "validateStart" TIMESTAMP(3),
    "validateEnd" TIMESTAMP(3),
    "testStart" TIMESTAMP(3),
    "testEnd" TIMESTAMP(3),
    "oosReturn" DOUBLE PRECISION,
    "oosSharpe" DOUBLE PRECISION,
    "oosDrawdown" DOUBLE PRECISION,
    "overfitRatio" DOUBLE PRECISION,
    "returnDecay" DOUBLE PRECISION,
    "stabilityScore" DOUBLE PRECISION,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalkForwardRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalkForwardSegment" (
    "id" TEXT NOT NULL,
    "walkForwardRunId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "returnPct" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "tradeCount" INTEGER,
    "metricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalkForwardSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalkForwardMetric" (
    "id" TEXT NOT NULL,
    "walkForwardRunId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalkForwardMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StrategyStressResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "simulationCount" INTEGER NOT NULL DEFAULT 500,
    "bestReturn" DOUBLE PRECISION,
    "medianReturn" DOUBLE PRECISION,
    "worstReturn" DOUBLE PRECISION,
    "riskOfRuin" DOUBLE PRECISION,
    "probability20Drawdown" DOUBLE PRECISION,
    "expectedCagr" DOUBLE PRECISION,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrategyStressResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalkForwardRun_userId_createdAt_idx" ON "WalkForwardRun"("userId", "createdAt");
CREATE INDEX "WalkForwardRun_experimentId_createdAt_idx" ON "WalkForwardRun"("experimentId", "createdAt");
CREATE INDEX "WalkForwardSegment_walkForwardRunId_segmentIndex_idx" ON "WalkForwardSegment"("walkForwardRunId", "segmentIndex");
CREATE INDEX "WalkForwardSegment_phase_idx" ON "WalkForwardSegment"("phase");
CREATE INDEX "WalkForwardMetric_walkForwardRunId_idx" ON "WalkForwardMetric"("walkForwardRunId");
CREATE INDEX "WalkForwardMetric_metricName_idx" ON "WalkForwardMetric"("metricName");
CREATE INDEX "StrategyStressResult_userId_createdAt_idx" ON "StrategyStressResult"("userId", "createdAt");
CREATE INDEX "StrategyStressResult_experimentId_createdAt_idx" ON "StrategyStressResult"("experimentId", "createdAt");

ALTER TABLE "WalkForwardRun" ADD CONSTRAINT "WalkForwardRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkForwardRun" ADD CONSTRAINT "WalkForwardRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkForwardSegment" ADD CONSTRAINT "WalkForwardSegment_walkForwardRunId_fkey" FOREIGN KEY ("walkForwardRunId") REFERENCES "WalkForwardRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkForwardMetric" ADD CONSTRAINT "WalkForwardMetric_walkForwardRunId_fkey" FOREIGN KEY ("walkForwardRunId") REFERENCES "WalkForwardRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyStressResult" ADD CONSTRAINT "StrategyStressResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyStressResult" ADD CONSTRAINT "StrategyStressResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
