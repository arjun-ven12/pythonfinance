-- Phase 2: IBKR paper broker execution persistence
-- Keep this migration narrowly scoped to broker paper-order storage so we
-- don't accidentally bundle unrelated schema drift into the deploy step.

CREATE TABLE "BrokerOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvalId" TEXT,
    "broker" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "mode" "BrokerExecutionMode" NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "limitPrice" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrokerFill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerOrderId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "executionId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerFill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrokerOrderEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerOrderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrokerOrder_userId_status_idx" ON "BrokerOrder"("userId", "status");
CREATE INDEX "BrokerOrder_userId_approvalId_idx" ON "BrokerOrder"("userId", "approvalId");
CREATE INDEX "BrokerOrder_userId_submittedAt_idx" ON "BrokerOrder"("userId", "submittedAt");
CREATE INDEX "BrokerOrder_userId_brokerOrderId_idx" ON "BrokerOrder"("userId", "brokerOrderId");
CREATE UNIQUE INDEX "BrokerOrder_userId_clientOrderId_key" ON "BrokerOrder"("userId", "clientOrderId");

CREATE INDEX "BrokerFill_userId_filledAt_idx" ON "BrokerFill"("userId", "filledAt");
CREATE INDEX "BrokerFill_userId_brokerOrderId_idx" ON "BrokerFill"("userId", "brokerOrderId");
CREATE UNIQUE INDEX "BrokerFill_userId_executionId_key" ON "BrokerFill"("userId", "executionId");

CREATE INDEX "BrokerOrderEvent_userId_createdAt_idx" ON "BrokerOrderEvent"("userId", "createdAt");
CREATE INDEX "BrokerOrderEvent_userId_brokerOrderId_idx" ON "BrokerOrderEvent"("userId", "brokerOrderId");
CREATE INDEX "BrokerOrderEvent_userId_eventType_idx" ON "BrokerOrderEvent"("userId", "eventType");

ALTER TABLE "BrokerOrder"
ADD CONSTRAINT "BrokerOrder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerOrder"
ADD CONSTRAINT "BrokerOrder_approvalId_fkey"
FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BrokerFill"
ADD CONSTRAINT "BrokerFill_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerFill"
ADD CONSTRAINT "BrokerFill_brokerOrderId_fkey"
FOREIGN KEY ("brokerOrderId") REFERENCES "BrokerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerOrderEvent"
ADD CONSTRAINT "BrokerOrderEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerOrderEvent"
ADD CONSTRAINT "BrokerOrderEvent_brokerOrderId_fkey"
FOREIGN KEY ("brokerOrderId") REFERENCES "BrokerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
