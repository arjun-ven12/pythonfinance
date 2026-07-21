CREATE TYPE "MemoryCategory" AS ENUM ('STRATEGY', 'PORTFOLIO', 'MATRIX', 'RESEARCH', 'TRADE', 'BROKER', 'APPROVAL', 'SCANNER', 'RISK', 'AI', 'SYSTEM');
CREATE TYPE "MemoryRetentionState" AS ENUM ('ACTIVE', 'ARCHIVED', 'EXCLUDED', 'DELETED_PENDING');
CREATE TYPE "MemoryCreatedByType" AS ENUM ('USER', 'AI', 'SYSTEM', 'BACKFILL');
CREATE TYPE "MemoryFeedbackType" AS ENUM ('USEFUL', 'NOT_USEFUL', 'INCORRECT', 'CORRECTED', 'CONFIRMED_BY_OUTCOME', 'DISPROVED_BY_OUTCOME', 'EXCLUDE_FROM_AI');

CREATE TABLE "MemoryEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "MemoryCategory" NOT NULL,
  "eventType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "structuredData" JSONB NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceVersion" TEXT,
  "importance" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionState" "MemoryRetentionState" NOT NULL DEFAULT 'ACTIVE',
  "excludedFromAi" BOOLEAN NOT NULL DEFAULT false,
  "contentHash" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdByType" "MemoryCreatedByType" NOT NULL DEFAULT 'SYSTEM',
  "createdById" TEXT,
  "schemaVersion" TEXT NOT NULL DEFAULT '1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryLink" (
  "id" TEXT NOT NULL,
  "memoryEventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryFeedback" (
  "id" TEXT NOT NULL,
  "memoryEventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feedbackType" "MemoryFeedbackType" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryEvent_userId_dedupeKey_key" ON "MemoryEvent"("userId", "dedupeKey");
CREATE INDEX "MemoryEvent_userId_occurredAt_idx" ON "MemoryEvent"("userId", "occurredAt");
CREATE INDEX "MemoryEvent_userId_category_occurredAt_idx" ON "MemoryEvent"("userId", "category", "occurredAt");
CREATE INDEX "MemoryEvent_userId_eventType_occurredAt_idx" ON "MemoryEvent"("userId", "eventType", "occurredAt");
CREATE INDEX "MemoryEvent_userId_importance_occurredAt_idx" ON "MemoryEvent"("userId", "importance", "occurredAt");
CREATE INDEX "MemoryEvent_userId_retentionState_occurredAt_idx" ON "MemoryEvent"("userId", "retentionState", "occurredAt");
CREATE INDEX "MemoryEvent_sourceType_sourceId_idx" ON "MemoryEvent"("sourceType", "sourceId");
CREATE INDEX "MemoryEvent_contentHash_idx" ON "MemoryEvent"("contentHash");
CREATE UNIQUE INDEX "MemoryLink_memoryEventId_entityType_entityId_relationshipType_key" ON "MemoryLink"("memoryEventId", "entityType", "entityId", "relationshipType");
CREATE INDEX "MemoryLink_userId_entityType_entityId_createdAt_idx" ON "MemoryLink"("userId", "entityType", "entityId", "createdAt");
CREATE INDEX "MemoryLink_userId_relationshipType_createdAt_idx" ON "MemoryLink"("userId", "relationshipType", "createdAt");
CREATE INDEX "MemoryFeedback_memoryEventId_createdAt_idx" ON "MemoryFeedback"("memoryEventId", "createdAt");
CREATE INDEX "MemoryFeedback_userId_feedbackType_createdAt_idx" ON "MemoryFeedback"("userId", "feedbackType", "createdAt");
ALTER TABLE "MemoryEvent" ADD CONSTRAINT "MemoryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryLink" ADD CONSTRAINT "MemoryLink_memoryEventId_fkey" FOREIGN KEY ("memoryEventId") REFERENCES "MemoryEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryLink" ADD CONSTRAINT "MemoryLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryFeedback" ADD CONSTRAINT "MemoryFeedback_memoryEventId_fkey" FOREIGN KEY ("memoryEventId") REFERENCES "MemoryEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryFeedback" ADD CONSTRAINT "MemoryFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
