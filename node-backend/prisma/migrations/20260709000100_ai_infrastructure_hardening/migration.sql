CREATE TABLE "AiInvocation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "featureType" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "promptTemplateId" TEXT,
  "promptVersion" TEXT,
  "promptHash" TEXT,
  "schemaName" TEXT,
  "schemaHash" TEXT,
  "inputHash" TEXT NOT NULL,
  "providerResponseId" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "estimatedCostUsd" DOUBLE PRECISION,
  "latencyMs" INTEGER,
  "status" TEXT NOT NULL,
  "errorCategory" TEXT,
  "cacheStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiInvocation_userId_createdAt_idx" ON "AiInvocation"("userId", "createdAt");
CREATE INDEX "AiInvocation_userId_featureType_createdAt_idx" ON "AiInvocation"("userId", "featureType", "createdAt");
CREATE INDEX "AiInvocation_featureType_createdAt_idx" ON "AiInvocation"("featureType", "createdAt");
CREATE INDEX "AiInvocation_status_createdAt_idx" ON "AiInvocation"("status", "createdAt");

ALTER TABLE "AiInvocation" ADD CONSTRAINT "AiInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
