CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SNOOZED', 'EXECUTED');

CREATE TYPE "ApprovalMode" AS ENUM ('MANUAL_APPROVAL', 'SEMI_AUTOMATED', 'FULL_AUTOMATION');

CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "opportunityScore" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "recommendation" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'MANUAL_APPROVAL',
    "reason" TEXT,
    "preTradeAnalysisJson" JSONB,
    "safetyViolationsJson" JSONB,
    "newsEventsJson" JSONB,
    "openaiReasoningJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "raw" JSONB,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_symbol_idx" ON "ApprovalRequest"("symbol");

CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

CREATE INDEX "ApprovalRequest_approvalMode_idx" ON "ApprovalRequest"("approvalMode");
