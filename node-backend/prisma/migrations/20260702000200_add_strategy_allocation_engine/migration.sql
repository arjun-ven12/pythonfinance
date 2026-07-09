DO $$
BEGIN
  CREATE TYPE "StrategyAllocationMethod" AS ENUM (
    'EQUAL_WEIGHT',
    'MANUAL_WEIGHT',
    'RISK_PARITY',
    'CONFIDENCE_WEIGHTED',
    'EVIDENCE_WEIGHTED',
    'VOLATILITY_ADJUSTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "StrategyAllocationCellStatus" AS ENUM (
    'ACTIVE',
    'PENDING',
    'SIT_OUT',
    'BLOCKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StrategyDeploymentSet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Primary Deployment Set',
  "ownerExperimentId" TEXT,
  "ownerStrategyVersionId" TEXT,
  "allocationMethod" "StrategyAllocationMethod" NOT NULL DEFAULT 'EQUAL_WEIGHT',
  "rebalanceFrequency" TEXT NOT NULL DEFAULT 'WEEKLY',
  "maxDriftPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "guardrailsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategyDeploymentSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StrategyDeploymentRoute" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "regime" TEXT NOT NULL,
  "selectedExperimentId" TEXT,
  "selectedStrategyVersionId" TEXT,
  "allocationPct" DOUBLE PRECISION,
  "status" "StrategyAllocationCellStatus" NOT NULL DEFAULT 'SIT_OUT',
  "evidenceStatus" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategyDeploymentRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StrategyCapitalAllocation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT NOT NULL,
  "experimentId" TEXT NOT NULL,
  "strategyVersionId" TEXT,
  "method" "StrategyAllocationMethod" NOT NULL DEFAULT 'EQUAL_WEIGHT',
  "assignedCapitalPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxAllocationPct" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StrategyCapitalAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StrategyAllocationSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT NOT NULL,
  "allocationMethod" "StrategyAllocationMethod" NOT NULL,
  "allocationsJson" JSONB NOT NULL,
  "matrixJson" JSONB NOT NULL,
  "simulationJson" JSONB,
  "guardrailsJson" JSONB,
  "rebalanceJson" JSONB,
  "reasonNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrategyAllocationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StrategyAllocationAuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "experimentId" TEXT,
  "action" TEXT NOT NULL,
  "previousAllocation" JSONB,
  "newAllocation" JSONB,
  "reasonNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrategyAllocationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StrategyDeploymentSet_userId_key"
  ON "StrategyDeploymentSet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StrategyDeploymentRoute_deploymentSetId_sector_regime_key"
  ON "StrategyDeploymentRoute"("deploymentSetId", "sector", "regime");
CREATE UNIQUE INDEX IF NOT EXISTS "StrategyCapitalAllocation_deploymentSetId_experimentId_key"
  ON "StrategyCapitalAllocation"("deploymentSetId", "experimentId");

CREATE INDEX IF NOT EXISTS "StrategyDeploymentSet_ownerExperimentId_idx"
  ON "StrategyDeploymentSet"("ownerExperimentId");
CREATE INDEX IF NOT EXISTS "StrategyDeploymentSet_ownerStrategyVersionId_idx"
  ON "StrategyDeploymentSet"("ownerStrategyVersionId");
CREATE INDEX IF NOT EXISTS "StrategyDeploymentRoute_userId_status_idx"
  ON "StrategyDeploymentRoute"("userId", "status");
CREATE INDEX IF NOT EXISTS "StrategyDeploymentRoute_selectedExperimentId_idx"
  ON "StrategyDeploymentRoute"("selectedExperimentId");
CREATE INDEX IF NOT EXISTS "StrategyDeploymentRoute_selectedStrategyVersionId_idx"
  ON "StrategyDeploymentRoute"("selectedStrategyVersionId");
CREATE INDEX IF NOT EXISTS "StrategyCapitalAllocation_userId_status_idx"
  ON "StrategyCapitalAllocation"("userId", "status");
CREATE INDEX IF NOT EXISTS "StrategyCapitalAllocation_strategyVersionId_idx"
  ON "StrategyCapitalAllocation"("strategyVersionId");
CREATE INDEX IF NOT EXISTS "StrategyAllocationSnapshot_userId_createdAt_idx"
  ON "StrategyAllocationSnapshot"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategyAllocationSnapshot_deploymentSetId_createdAt_idx"
  ON "StrategyAllocationSnapshot"("deploymentSetId", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategyAllocationAuditLog_userId_createdAt_idx"
  ON "StrategyAllocationAuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategyAllocationAuditLog_deploymentSetId_createdAt_idx"
  ON "StrategyAllocationAuditLog"("deploymentSetId", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategyAllocationAuditLog_actorUserId_createdAt_idx"
  ON "StrategyAllocationAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "StrategyAllocationAuditLog_experimentId_createdAt_idx"
  ON "StrategyAllocationAuditLog"("experimentId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentSet"
    ADD CONSTRAINT "StrategyDeploymentSet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentSet"
    ADD CONSTRAINT "StrategyDeploymentSet_ownerExperimentId_fkey"
    FOREIGN KEY ("ownerExperimentId") REFERENCES "StrategyExperiment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentSet"
    ADD CONSTRAINT "StrategyDeploymentSet_ownerStrategyVersionId_fkey"
    FOREIGN KEY ("ownerStrategyVersionId") REFERENCES "StrategyVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentRoute"
    ADD CONSTRAINT "StrategyDeploymentRoute_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentRoute"
    ADD CONSTRAINT "StrategyDeploymentRoute_deploymentSetId_fkey"
    FOREIGN KEY ("deploymentSetId") REFERENCES "StrategyDeploymentSet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentRoute"
    ADD CONSTRAINT "StrategyDeploymentRoute_selectedExperimentId_fkey"
    FOREIGN KEY ("selectedExperimentId") REFERENCES "StrategyExperiment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyDeploymentRoute"
    ADD CONSTRAINT "StrategyDeploymentRoute_selectedStrategyVersionId_fkey"
    FOREIGN KEY ("selectedStrategyVersionId") REFERENCES "StrategyVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyCapitalAllocation"
    ADD CONSTRAINT "StrategyCapitalAllocation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyCapitalAllocation"
    ADD CONSTRAINT "StrategyCapitalAllocation_deploymentSetId_fkey"
    FOREIGN KEY ("deploymentSetId") REFERENCES "StrategyDeploymentSet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyCapitalAllocation"
    ADD CONSTRAINT "StrategyCapitalAllocation_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyCapitalAllocation"
    ADD CONSTRAINT "StrategyCapitalAllocation_strategyVersionId_fkey"
    FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationSnapshot"
    ADD CONSTRAINT "StrategyAllocationSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationSnapshot"
    ADD CONSTRAINT "StrategyAllocationSnapshot_deploymentSetId_fkey"
    FOREIGN KEY ("deploymentSetId") REFERENCES "StrategyDeploymentSet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationAuditLog"
    ADD CONSTRAINT "StrategyAllocationAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationAuditLog"
    ADD CONSTRAINT "StrategyAllocationAuditLog_deploymentSetId_fkey"
    FOREIGN KEY ("deploymentSetId") REFERENCES "StrategyDeploymentSet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationAuditLog"
    ADD CONSTRAINT "StrategyAllocationAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StrategyAllocationAuditLog"
    ADD CONSTRAINT "StrategyAllocationAuditLog_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "StrategyExperiment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
