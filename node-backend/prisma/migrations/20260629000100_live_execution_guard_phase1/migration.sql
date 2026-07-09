CREATE TYPE "BrokerExecutionMode" AS ENUM (
  'READ_ONLY',
  'PAPER_BROKER',
  'LIVE_DRY_RUN',
  'LIVE_SUPERVISED',
  'LIVE_LOCKED'
);

ALTER TABLE "BrokerConfig"
  ADD COLUMN "executionMode" "BrokerExecutionMode" NOT NULL DEFAULT 'READ_ONLY';

CREATE TABLE "BrokerExecutionAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "approvalId" TEXT,
  "symbol" TEXT NOT NULL,
  "side" "TradeSide" NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "mode" "BrokerExecutionMode" NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "blockedReason" TEXT,
  "requestPayload" JSONB,
  "brokerResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BrokerExecutionAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrokerExecutionAudit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BrokerExecutionAudit_approvalId_fkey"
    FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BrokerExecutionAudit_userId_createdAt_idx"
  ON "BrokerExecutionAudit"("userId", "createdAt");

CREATE INDEX "BrokerExecutionAudit_userId_mode_idx"
  ON "BrokerExecutionAudit"("userId", "mode");

CREATE INDEX "BrokerExecutionAudit_userId_approvalId_idx"
  ON "BrokerExecutionAudit"("userId", "approvalId");
