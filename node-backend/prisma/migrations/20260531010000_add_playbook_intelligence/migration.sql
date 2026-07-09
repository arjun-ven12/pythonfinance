-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tradingHorizon" TEXT,
    "executionMode" TEXT,
    "strategyProfile" JSONB,
    "riskProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "scanId" TEXT,
    "portfolioId" TEXT,
    "totalReturn" DOUBLE PRECISION,
    "cagr" DOUBLE PRECISION,
    "sharpe" DOUBLE PRECISION,
    "drawdown" DOUBLE PRECISION,
    "expectancy" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "trades" INTEGER,
    "regime" TEXT,
    "strongestSector" TEXT,
    "strongestHorizon" TEXT,
    "confidenceRange" TEXT,
    "openaiUsefulness" DOUBLE PRECISION,
    "approvalAccuracy" DOUBLE PRECISION,
    "newsImpact" DOUBLE PRECISION,
    "executionDecisions" JSONB,
    "marketRegimeJson" JSONB,
    "confidenceJson" JSONB,
    "newsEventsJson" JSONB,
    "safetyResultsJson" JSONB,
    "approvalResultsJson" JSONB,
    "paperTradesJson" JSONB,
    "portfolioJson" JSONB,
    "alertsJson" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookInsight" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT,
    "confidence" DOUBLE PRECISION,
    "explanation" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookSnapshot" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "settingsJson" JSONB,
    "riskJson" JSONB,
    "thresholdsJson" JSONB,
    "strategyJson" JSONB,
    "sourceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playbook_tradingHorizon_idx" ON "Playbook"("tradingHorizon");

-- CreateIndex
CREATE INDEX "Playbook_executionMode_idx" ON "Playbook"("executionMode");

-- CreateIndex
CREATE INDEX "PlaybookRun_playbookId_createdAt_idx" ON "PlaybookRun"("playbookId", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybookRun_scanId_idx" ON "PlaybookRun"("scanId");

-- CreateIndex
CREATE INDEX "PlaybookRun_regime_idx" ON "PlaybookRun"("regime");

-- CreateIndex
CREATE INDEX "PlaybookInsight_playbookId_insightType_idx" ON "PlaybookInsight"("playbookId", "insightType");

-- CreateIndex
CREATE INDEX "PlaybookInsight_createdAt_idx" ON "PlaybookInsight"("createdAt");

-- CreateIndex
CREATE INDEX "PlaybookSnapshot_playbookId_createdAt_idx" ON "PlaybookSnapshot"("playbookId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookInsight" ADD CONSTRAINT "PlaybookInsight_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookSnapshot" ADD CONSTRAINT "PlaybookSnapshot_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
