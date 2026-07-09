CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "strategyJson" JSONB NOT NULL,
    "settingsJson" JSONB,
    "evidenceJson" JSONB,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StrategyVersion_experimentId_version_key" ON "StrategyVersion"("experimentId", "version");
CREATE INDEX "StrategyVersion_userId_createdAt_idx" ON "StrategyVersion"("userId", "createdAt");
CREATE INDEX "StrategyVersion_experimentId_createdAt_idx" ON "StrategyVersion"("experimentId", "createdAt");

ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
