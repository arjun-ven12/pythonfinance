DO $$
DECLARE
  default_user_id TEXT;
BEGIN
  SELECT "id" INTO default_user_id
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF default_user_id IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "Scan" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "ValidationSignal" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "StockUniverse" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "StrategyPerformance" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "StrategyComparison" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "StrategyParameterSweep" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "Playbook" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "PlaybookRun" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "PlaybookInsight" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "PlaybookSnapshot" ADD COLUMN IF NOT EXISTS "userId" TEXT;
  ALTER TABLE "PlaybookExport" ADD COLUMN IF NOT EXISTS "userId" TEXT;

  UPDATE "Scan" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Opportunity" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "ValidationSignal" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Alert" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Watchlist" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StockUniverse" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Trade" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Position" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StrategyPerformance" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StrategyExperiment" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StrategyRun" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StrategyComparison" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "StrategyParameterSweep" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "ApprovalRequest" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "ProposedTrade" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "NotificationChannel" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Settings" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "PortfolioState" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "EngineRun" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "Playbook" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "PlaybookRun" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "PlaybookInsight" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "PlaybookSnapshot" SET "userId" = default_user_id WHERE "userId" IS NULL;
  UPDATE "PlaybookExport" SET "userId" = default_user_id WHERE "userId" IS NULL;
END $$;

WITH duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId", "name" ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "StrategyExperiment"
)
UPDATE "StrategyExperiment" AS experiment
SET "name" = experiment."name" || ' (' || duplicates.duplicate_number || ')'
FROM duplicates
WHERE experiment."id" = duplicates."id"
  AND duplicates.duplicate_number > 1;

WITH duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId", "name" ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "StockUniverse"
)
UPDATE "StockUniverse" AS universe
SET "name" = universe."name" || ' (' || duplicates.duplicate_number || ')'
FROM duplicates
WHERE universe."id" = duplicates."id"
  AND duplicates.duplicate_number > 1;

WITH duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "userId", "name" ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "Playbook"
)
UPDATE "Playbook" AS playbook
SET "name" = playbook."name" || ' (' || duplicates.duplicate_number || ')'
FROM duplicates
WHERE playbook."id" = duplicates."id"
  AND duplicates.duplicate_number > 1;

DROP INDEX IF EXISTS "Scan_externalScanId_key";
DROP INDEX IF EXISTS "ValidationSignal_symbol_timestamp_key";

ALTER TABLE "Scan" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Opportunity" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ValidationSignal" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Alert" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Watchlist" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StockUniverse" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Trade" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Position" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StrategyPerformance" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StrategyExperiment" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StrategyRun" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StrategyComparison" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StrategyParameterSweep" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ApprovalRequest" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ProposedTrade" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "NotificationChannel" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Settings" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PortfolioState" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "EngineRun" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Playbook" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PlaybookRun" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PlaybookInsight" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PlaybookSnapshot" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PlaybookExport" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "EngineRun" DROP CONSTRAINT IF EXISTS "EngineRun_userId_fkey";
ALTER TABLE "EngineRun"
  ADD CONSTRAINT "EngineRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scan"
  ADD CONSTRAINT "Scan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationSignal"
  ADD CONSTRAINT "ValidationSignal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockUniverse"
  ADD CONSTRAINT "StockUniverse_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyPerformance"
  ADD CONSTRAINT "StrategyPerformance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyComparison"
  ADD CONSTRAINT "StrategyComparison_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyParameterSweep"
  ADD CONSTRAINT "StrategyParameterSweep_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Playbook"
  ADD CONSTRAINT "Playbook_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookRun"
  ADD CONSTRAINT "PlaybookRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookInsight"
  ADD CONSTRAINT "PlaybookInsight_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookSnapshot"
  ADD CONSTRAINT "PlaybookSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookExport"
  ADD CONSTRAINT "PlaybookExport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Scan_userId_externalScanId_key"
  ON "Scan"("userId", "externalScanId");
CREATE UNIQUE INDEX "ValidationSignal_userId_symbol_timestamp_key"
  ON "ValidationSignal"("userId", "symbol", "timestamp");
CREATE UNIQUE INDEX "StrategyExperiment_userId_name_key"
  ON "StrategyExperiment"("userId", "name");
CREATE UNIQUE INDEX "StockUniverse_userId_name_key"
  ON "StockUniverse"("userId", "name");
CREATE UNIQUE INDEX "Playbook_userId_name_key"
  ON "Playbook"("userId", "name");
CREATE UNIQUE INDEX "NotificationChannel_userId_channel_key"
  ON "NotificationChannel"("userId", "channel");

CREATE INDEX "Scan_userId_generatedAt_idx" ON "Scan"("userId", "generatedAt");
CREATE INDEX "Opportunity_userId_createdAt_idx" ON "Opportunity"("userId", "createdAt");
CREATE INDEX "ValidationSignal_userId_createdAt_idx" ON "ValidationSignal"("userId", "createdAt");
CREATE INDEX "StockUniverse_userId_createdAt_idx" ON "StockUniverse"("userId", "createdAt");
CREATE INDEX "Trade_userId_createdAt_idx" ON "Trade"("userId", "createdAt");
CREATE INDEX "StrategyPerformance_userId_createdAt_idx" ON "StrategyPerformance"("userId", "createdAt");
CREATE INDEX "StrategyExperiment_userId_createdAt_idx" ON "StrategyExperiment"("userId", "createdAt");
CREATE INDEX "StrategyComparison_userId_createdAt_idx" ON "StrategyComparison"("userId", "createdAt");
CREATE INDEX "StrategyParameterSweep_userId_createdAt_idx" ON "StrategyParameterSweep"("userId", "createdAt");
CREATE INDEX "ApprovalRequest_userId_createdAt_idx" ON "ApprovalRequest"("userId", "createdAt");
CREATE INDEX "NotificationChannel_userId_createdAt_idx" ON "NotificationChannel"("userId", "createdAt");
CREATE INDEX "Playbook_userId_createdAt_idx" ON "Playbook"("userId", "createdAt");
CREATE INDEX "PlaybookRun_userId_createdAt_idx" ON "PlaybookRun"("userId", "createdAt");
CREATE INDEX "PlaybookInsight_userId_createdAt_idx" ON "PlaybookInsight"("userId", "createdAt");
CREATE INDEX "PlaybookSnapshot_userId_createdAt_idx" ON "PlaybookSnapshot"("userId", "createdAt");
CREATE INDEX "PlaybookExport_userId_createdAt_idx" ON "PlaybookExport"("userId", "createdAt");

CREATE TABLE "PaperTrade" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "symbol" TEXT NOT NULL,
  "side" "TradeSide" NOT NULL,
  "orderType" "OrderType" NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "requestedPrice" DOUBLE PRECISION,
  "fillPrice" DOUBLE PRECISION NOT NULL,
  "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "slippageBps" DOUBLE PRECISION,
  "status" "TradeStatus" NOT NULL DEFAULT 'FILLED',
  "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperTrade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaperTrade_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PaperTrade_userId_approvalRequestId_key"
  ON "PaperTrade"("userId", "approvalRequestId");
CREATE INDEX "PaperTrade_userId_createdAt_idx"
  ON "PaperTrade"("userId", "createdAt");
CREATE INDEX "PaperTrade_userId_symbol_idx"
  ON "PaperTrade"("userId", "symbol");

CREATE TABLE "SafetySettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SafetySettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SafetySettings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SafetySettings_userId_key" ON "SafetySettings"("userId");

CREATE TABLE "BrokerConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'IBKR',
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrokerConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrokerConfig_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BrokerConfig_userId_key" ON "BrokerConfig"("userId");

CREATE TABLE "EngineStatus" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngineStatus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineStatus_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EngineStatus_userId_key" ON "EngineStatus"("userId");
