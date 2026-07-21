ALTER TABLE "AiInvocation"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "userIds" JSONB,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "endpoint" TEXT,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "cachedTokens" INTEGER,
  ADD COLUMN "inputTokenCostUsd" DOUBLE PRECISION,
  ADD COLUMN "outputTokenCostUsd" DOUBLE PRECISION,
  ADD COLUMN "cachedTokenCostUsd" DOUBLE PRECISION,
  ADD COLUMN "observabilityCostUsd" DOUBLE PRECISION,
  ADD COLUMN "estimatedCostSgd" DOUBLE PRECISION,
  ADD COLUMN "usdToSgdRate" DOUBLE PRECISION,
  ADD COLUMN "pricingVersion" TEXT,
  ADD COLUMN "pricingConfigured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "providerLatencyMs" INTEGER,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokenBreakdown" JSONB,
  ADD COLUMN "contextBreakdown" JSONB,
  ADD COLUMN "contextDiff" JSONB,
  ADD COLUMN "largestContributor" TEXT,
  ADD COLUMN "warnings" JSONB,
  ADD COLUMN "responseAnalysis" JSONB;

CREATE INDEX "AiInvocation_model_createdAt_idx"
  ON "AiInvocation"("model", "createdAt");

CREATE INDEX "AiInvocation_requestId_idx"
  ON "AiInvocation"("requestId");
