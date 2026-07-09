CREATE TYPE "PlaybookRecommendationStatus" AS ENUM (
  'PENDING_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'CONVERTED_TO_DRAFT'
);

ALTER TABLE "Playbook"
  ADD COLUMN "activeVersionId" TEXT;

CREATE TABLE "PlaybookVersion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "playbookId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "strategyExperimentId" TEXT,
  "strategyRunId" TEXT,
  "settingsSnapshot" JSONB NOT NULL,
  "riskSnapshot" JSONB NOT NULL,
  "universeSnapshot" JSONB NOT NULL,
  "executionMode" TEXT NOT NULL,
  "horizon" TEXT NOT NULL,
  "benchmark" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "changeNote" TEXT,
  CONSTRAINT "PlaybookVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlaybookRun"
  ADD COLUMN "playbookVersionId" TEXT,
  ADD COLUMN "strategyRunId" TEXT,
  ADD COLUMN "sortino" DOUBLE PRECISION,
  ADD COLUMN "profitFactor" DOUBLE PRECISION,
  ADD COLUMN "alpha" DOUBLE PRECISION,
  ADD COLUMN "benchmark" TEXT,
  ADD COLUMN "portfolioSnapshotId" TEXT,
  ADD COLUMN "approvalSummary" JSONB,
  ADD COLUMN "executionSummary" JSONB,
  ADD COLUMN "validationWarnings" JSONB,
  ADD COLUMN "overfittingRisk" TEXT;

ALTER TABLE "PlaybookInsight"
  ADD COLUMN "playbookVersionId" TEXT,
  ADD COLUMN "type" TEXT,
  ADD COLUMN "formula" TEXT,
  ADD COLUMN "sampleSize" INTEGER,
  ADD COLUMN "reliability" TEXT,
  ADD COLUMN "supportingRunIds" JSONB,
  ADD COLUMN "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "PlaybookRecommendation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "playbookVersionId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "PlaybookRecommendationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "proposal" JSONB NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaybookRecommendation_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlaybookVersion" (
  "id",
  "userId",
  "playbookId",
  "versionNumber",
  "settingsSnapshot",
  "riskSnapshot",
  "universeSnapshot",
  "executionMode",
  "horizon",
  "benchmark",
  "createdAt",
  "createdBy",
  "changeNote"
)
SELECT
  gen_random_uuid()::text,
  p."userId",
  p."id",
  1,
  COALESCE(p."strategyProfile", '{}'::jsonb),
  COALESCE(p."riskProfile", '{}'::jsonb),
  '{}'::jsonb,
  COALESCE(p."executionMode", 'MANUAL_APPROVAL'),
  COALESCE(p."tradingHorizon", 'SWING'),
  'SPY',
  p."createdAt",
  p."userId",
  'Migrated from legacy Playbook state'
FROM "Playbook" p;

UPDATE "Playbook" p
SET "activeVersionId" = v."id"
FROM "PlaybookVersion" v
WHERE v."playbookId" = p."id" AND v."versionNumber" = 1;

UPDATE "PlaybookRun" r
SET "playbookVersionId" = p."activeVersionId"
FROM "Playbook" p
WHERE r."playbookId" = p."id";

UPDATE "PlaybookInsight" i
SET
  "playbookVersionId" = p."activeVersionId",
  "type" = i."insightType",
  "sampleSize" = 0,
  "reliability" = 'LEGACY_UNVERIFIED',
  "supportingRunIds" = '[]'::jsonb
FROM "Playbook" p
WHERE i."playbookId" = p."id";

CREATE UNIQUE INDEX "Playbook_activeVersionId_key" ON "Playbook"("activeVersionId");
CREATE UNIQUE INDEX "PlaybookVersion_playbookId_versionNumber_key"
  ON "PlaybookVersion"("playbookId", "versionNumber");
CREATE INDEX "PlaybookVersion_userId_idx" ON "PlaybookVersion"("userId");
CREATE INDEX "PlaybookVersion_userId_playbookId_idx"
  ON "PlaybookVersion"("userId", "playbookId");
CREATE INDEX "PlaybookVersion_userId_createdAt_idx"
  ON "PlaybookVersion"("userId", "createdAt");
CREATE INDEX "PlaybookRun_playbookVersionId_createdAt_idx"
  ON "PlaybookRun"("playbookVersionId", "createdAt");
CREATE INDEX "PlaybookInsight_playbookVersionId_insightType_idx"
  ON "PlaybookInsight"("playbookVersionId", "insightType");
CREATE INDEX "PlaybookRecommendation_userId_idx"
  ON "PlaybookRecommendation"("userId");
CREATE INDEX "PlaybookRecommendation_userId_createdAt_idx"
  ON "PlaybookRecommendation"("userId", "createdAt");
CREATE INDEX "PlaybookRecommendation_userId_playbookVersionId_idx"
  ON "PlaybookRecommendation"("userId", "playbookVersionId");
CREATE INDEX "PlaybookRecommendation_playbookVersionId_status_idx"
  ON "PlaybookRecommendation"("playbookVersionId", "status");

ALTER TABLE "PlaybookVersion"
  ADD CONSTRAINT "PlaybookVersion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PlaybookVersion_playbookId_fkey"
  FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PlaybookVersion_strategyExperimentId_fkey"
  FOREIGN KEY ("strategyExperimentId") REFERENCES "StrategyExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PlaybookVersion_strategyRunId_fkey"
  FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Playbook"
  ADD CONSTRAINT "Playbook_activeVersionId_fkey"
  FOREIGN KEY ("activeVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlaybookRun"
  ADD CONSTRAINT "PlaybookRun_playbookVersionId_fkey"
  FOREIGN KEY ("playbookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlaybookRun_strategyRunId_fkey"
  FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlaybookInsight"
  ADD CONSTRAINT "PlaybookInsight_playbookVersionId_fkey"
  FOREIGN KEY ("playbookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlaybookRecommendation"
  ADD CONSTRAINT "PlaybookRecommendation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PlaybookRecommendation_playbookVersionId_fkey"
  FOREIGN KEY ("playbookVersionId") REFERENCES "PlaybookVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_playbook_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new Playbook version or record instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlaybookVersion_append_only"
BEFORE UPDATE OR DELETE ON "PlaybookVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_playbook_history_mutation();

CREATE TRIGGER "PlaybookRun_append_only"
BEFORE UPDATE OR DELETE ON "PlaybookRun"
FOR EACH ROW EXECUTE FUNCTION prevent_playbook_history_mutation();

CREATE TRIGGER "PlaybookInsight_append_only"
BEFORE UPDATE OR DELETE ON "PlaybookInsight"
FOR EACH ROW EXECUTE FUNCTION prevent_playbook_history_mutation();
