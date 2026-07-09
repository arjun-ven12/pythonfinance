-- Alerts Platform V3

CREATE TYPE "AlertDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'RETRYING');

ALTER TABLE "Alert"
  ADD COLUMN IF NOT EXISTS "scoreBucket" TEXT;

ALTER TABLE "Alert"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Alert"
  DROP CONSTRAINT IF EXISTS "Alert_userId_category_symbol_severity_key";

UPDATE "Alert"
SET
  "scoreBucket" = CASE
    WHEN "score" >= 90 THEN '90-100'
    WHEN "score" >= 80 THEN '80-89'
    WHEN "score" >= 70 THEN '70-79'
    WHEN "score" >= 60 THEN '60-69'
    WHEN "score" >= 50 THEN '50-59'
    ELSE '0-49'
  END,
  "dedupeKey" = CONCAT(
    "userId",
    ':',
    "category"::TEXT,
    ':',
    UPPER(COALESCE("symbol", 'SYSTEM')),
    ':',
    "severity"::TEXT,
    ':',
    CASE
      WHEN "score" >= 90 THEN '90-100'
      WHEN "score" >= 80 THEN '80-89'
      WHEN "score" >= 70 THEN '70-79'
      WHEN "score" >= 60 THEN '60-69'
      WHEN "score" >= 50 THEN '50-59'
      ELSE '0-49'
    END
  )
WHERE "dedupeKey" IS NULL OR "scoreBucket" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Alert_userId_dedupeKey_key"
  ON "Alert"("userId", "dedupeKey");

CREATE INDEX IF NOT EXISTS "Alert_userId_dedupeKey_idx"
  ON "Alert"("userId", "dedupeKey");

ALTER TABLE "NotificationChannel"
  ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastDeliveryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AlertDelivery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "channelId" TEXT,
  "status" "AlertDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "category" "AlertCategory",
  "severity" "AlertSeverity",
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlertDigest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "alertIds" JSONB NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AlertDigest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertDelivery_userId_status_nextAttemptAt_idx" ON "AlertDelivery"("userId", "status", "nextAttemptAt");
CREATE INDEX "AlertDelivery_alertId_idx" ON "AlertDelivery"("alertId");
CREATE INDEX "AlertDelivery_channelId_idx" ON "AlertDelivery"("channelId");
CREATE UNIQUE INDEX "AlertRule_userId_name_key" ON "AlertRule"("userId", "name");
CREATE INDEX "AlertRule_userId_enabled_idx" ON "AlertRule"("userId", "enabled");
CREATE INDEX "AlertDigest_userId_status_scheduledAt_idx" ON "AlertDigest"("userId", "status", "scheduledAt");

ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlertDigest" ADD CONSTRAINT "AlertDigest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
