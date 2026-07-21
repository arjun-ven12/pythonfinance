CREATE TABLE "MemoryRetrievalAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestingFeature" TEXT NOT NULL,
  "queryHash" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "memoryMode" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "candidateCounts" JSONB NOT NULL,
  "finalMemoryIds" JSONB NOT NULL,
  "scoreRange" JSONB NOT NULL,
  "retrievalStatus" TEXT NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "vectorSearchUsed" BOOLEAN NOT NULL DEFAULT false,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "rankingVersion" TEXT NOT NULL,
  "contextTokenEstimate" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryRetrievalAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemoryRetrievalAudit_userId_createdAt_idx"
  ON "MemoryRetrievalAudit"("userId", "createdAt");
CREATE INDEX "MemoryRetrievalAudit_userId_intent_createdAt_idx"
  ON "MemoryRetrievalAudit"("userId", "intent", "createdAt");
CREATE INDEX "MemoryRetrievalAudit_retrievalStatus_createdAt_idx"
  ON "MemoryRetrievalAudit"("retrievalStatus", "createdAt");
CREATE INDEX "MemoryRetrievalAudit_rankingVersion_createdAt_idx"
  ON "MemoryRetrievalAudit"("rankingVersion", "createdAt");

CREATE INDEX "MemoryEvent_title_summary_fts_idx"
  ON "MemoryEvent"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("summary", '')));

ALTER TABLE "MemoryRetrievalAudit"
  ADD CONSTRAINT "MemoryRetrievalAudit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
