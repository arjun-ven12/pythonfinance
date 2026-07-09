CREATE TYPE "StrategyDeploymentStatus" AS ENUM (
    'DRAFT',
    'RESEARCH',
    'CANDIDATE',
    'ACTIVE',
    'ARCHIVED'
);

ALTER TABLE "StrategyVersion"
    ADD COLUMN "deploymentStatus" "StrategyDeploymentStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "activationRulesJson" JSONB,
    ADD COLUMN "activatedAt" TIMESTAMP(3),
    ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Scan"
    ADD COLUMN "strategyVersionId" TEXT;

ALTER TABLE "Opportunity"
    ADD COLUMN "strategyVersionId" TEXT,
    ADD COLUMN "signalScore" DOUBLE PRECISION,
    ADD COLUMN "ruleSnapshot" JSONB;

ALTER TABLE "ValidationSignal"
    ADD COLUMN "strategyVersionId" TEXT;

CREATE INDEX "StrategyVersion_userId_deploymentStatus_idx"
    ON "StrategyVersion"("userId", "deploymentStatus");

CREATE INDEX "StrategyVersion_experimentId_deploymentStatus_idx"
    ON "StrategyVersion"("experimentId", "deploymentStatus");

CREATE INDEX "Scan_strategyVersionId_idx"
    ON "Scan"("strategyVersionId");

CREATE INDEX "Opportunity_strategyVersionId_idx"
    ON "Opportunity"("strategyVersionId");

CREATE INDEX "ValidationSignal_strategyVersionId_idx"
    ON "ValidationSignal"("strategyVersionId");
