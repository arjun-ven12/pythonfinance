ALTER TABLE "Alert" ADD COLUMN "userId" TEXT;
ALTER TABLE "Watchlist" ADD COLUMN "userId" TEXT;
ALTER TABLE "Trade" ADD COLUMN "userId" TEXT;
ALTER TABLE "Position" ADD COLUMN "userId" TEXT;
ALTER TABLE "ProposedTrade" ADD COLUMN "userId" TEXT;
ALTER TABLE "ApprovalRequest" ADD COLUMN "userId" TEXT;
ALTER TABLE "StrategyExperiment" ADD COLUMN "userId" TEXT;
ALTER TABLE "StrategyRun" ADD COLUMN "userId" TEXT;

DO $$
DECLARE
  default_user_id TEXT;
BEGIN
  SELECT "id" INTO default_user_id
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF default_user_id IS NOT NULL THEN
    UPDATE "Alert" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "Watchlist" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "Trade" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "Position" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "ProposedTrade" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "ApprovalRequest" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "StrategyExperiment" SET "userId" = default_user_id WHERE "userId" IS NULL;
    UPDATE "StrategyRun" SET "userId" = default_user_id WHERE "userId" IS NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS "Watchlist_symbol_key";
DROP INDEX IF EXISTS "Position_symbol_key";

CREATE UNIQUE INDEX "Watchlist_userId_symbol_key"
ON "Watchlist"("userId", "symbol");
CREATE UNIQUE INDEX "Position_userId_symbol_key"
ON "Position"("userId", "symbol");

CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");
CREATE INDEX "Trade_userId_idx" ON "Trade"("userId");
CREATE INDEX "Position_userId_idx" ON "Position"("userId");
CREATE INDEX "ProposedTrade_userId_idx" ON "ProposedTrade"("userId");
CREATE INDEX "ApprovalRequest_userId_idx" ON "ApprovalRequest"("userId");
CREATE INDEX "StrategyExperiment_userId_idx" ON "StrategyExperiment"("userId");
CREATE INDEX "StrategyRun_userId_idx" ON "StrategyRun"("userId");

ALTER TABLE "Alert"
ADD CONSTRAINT "Alert_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Watchlist"
ADD CONSTRAINT "Watchlist_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade"
ADD CONSTRAINT "Trade_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Position"
ADD CONSTRAINT "Position_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposedTrade"
ADD CONSTRAINT "ProposedTrade_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest"
ADD CONSTRAINT "ApprovalRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyExperiment"
ADD CONSTRAINT "StrategyExperiment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrategyRun"
ADD CONSTRAINT "StrategyRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationChannel" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "channel" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationChannel_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Settings" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Settings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PortfolioState" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "equity" DOUBLE PRECISION,
  "cash" DOUBLE PRECISION,
  "stateJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PortfolioState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EngineRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "scanId" TEXT,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "durationSeconds" DOUBLE PRECISION,
  "error" TEXT,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineRun_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "NotificationChannel_userId_idx" ON "NotificationChannel"("userId");
CREATE INDEX "NotificationChannel_channel_idx" ON "NotificationChannel"("channel");
CREATE UNIQUE INDEX "Settings_userId_key_key" ON "Settings"("userId", "key");
CREATE INDEX "Settings_userId_idx" ON "Settings"("userId");
CREATE INDEX "PortfolioState_userId_updatedAt_idx" ON "PortfolioState"("userId", "updatedAt");
CREATE INDEX "EngineRun_userId_startedAt_idx" ON "EngineRun"("userId", "startedAt");
CREATE INDEX "EngineRun_scanId_idx" ON "EngineRun"("scanId");
CREATE INDEX "EngineRun_status_idx" ON "EngineRun"("status");
