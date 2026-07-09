-- Alerts V2 lifecycle, dedupe, and action fields.
CREATE TYPE "AlertCategory" AS ENUM ('SCANNER', 'APPROVAL', 'RISK', 'PORTFOLIO', 'ENGINE', 'BROKER', 'VALIDATION', 'SYSTEM');
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED', 'EXPIRED');
CREATE TYPE "AlertSource" AS ENUM ('SCAN', 'RULE', 'MANUAL', 'SYSTEM');

ALTER TABLE "Alert"
  ADD COLUMN "category" "AlertCategory" NOT NULL DEFAULT 'SCANNER',
  ADD COLUMN "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "source" "AlertSource" NOT NULL DEFAULT 'SCAN',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "message" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "occurrences" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "actionedBy" TEXT,
  ADD COLUMN "actionReason" TEXT;

UPDATE "Alert"
SET
  "title" = COALESCE("title", "symbol" || ' high-score BUY alert'),
  "message" = COALESCE("message", 'Scanner generated a high-score BUY alert.'),
  "metadata" = COALESCE("metadata", '{}'::jsonb),
  "lastTriggeredAt" = COALESCE("lastTriggeredAt", "generatedAt"),
  "dedupeKey" = COALESCE("dedupeKey", "userId" || ':SCANNER:' || "symbol" || ':MEDIUM');

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "category", "symbol", "severity"
      ORDER BY COALESCE("lastTriggeredAt", "generatedAt") DESC, "generatedAt" DESC, id DESC
    ) AS row_number,
    COUNT(*) OVER (PARTITION BY "userId", "category", "symbol", "severity") AS duplicate_count,
    MAX(COALESCE("lastTriggeredAt", "generatedAt")) OVER (PARTITION BY "userId", "category", "symbol", "severity") AS latest_triggered_at
  FROM "Alert"
), kept AS (
  UPDATE "Alert" target
  SET
    "occurrences" = GREATEST(target."occurrences", ranked.duplicate_count),
    "lastTriggeredAt" = ranked.latest_triggered_at
  FROM ranked
  WHERE target.id = ranked.id AND ranked.row_number = 1
  RETURNING target.id
)
DELETE FROM "Alert"
USING ranked
WHERE "Alert".id = ranked.id AND ranked.row_number > 1;

CREATE INDEX "Alert_userId_status_severity_idx" ON "Alert"("userId", "status", "severity");
CREATE INDEX "Alert_userId_category_status_idx" ON "Alert"("userId", "category", "status");
CREATE INDEX "Alert_userId_lastTriggeredAt_idx" ON "Alert"("userId", "lastTriggeredAt");
CREATE UNIQUE INDEX "Alert_userId_category_symbol_severity_key" ON "Alert"("userId", "category", "symbol", "severity");
