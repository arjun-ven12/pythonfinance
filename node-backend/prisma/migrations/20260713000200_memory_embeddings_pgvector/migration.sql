CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "MemoryEmbeddingStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'STALE',
  'EXCLUDED'
);

CREATE TABLE "MemoryEmbedding" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "memoryEventId" TEXT NOT NULL,
  "embeddingProvider" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embeddingVersion" TEXT NOT NULL,
  "documentBuilderVersion" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "sourceContentHash" TEXT NOT NULL,
  "documentPreview" TEXT,
  "status" "MemoryEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCategory" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "embeddedAt" TIMESTAMP(3),
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoryEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryEmbedding_memoryEventId_key"
  ON "MemoryEmbedding"("memoryEventId");
CREATE INDEX "MemoryEmbedding_userId_status_nextAttemptAt_idx"
  ON "MemoryEmbedding"("userId", "status", "nextAttemptAt");
CREATE INDEX "MemoryEmbedding_status_nextAttemptAt_createdAt_idx"
  ON "MemoryEmbedding"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "MemoryEmbedding_embeddingProvider_embeddingModel_embeddingVersion_idx"
  ON "MemoryEmbedding"("embeddingProvider", "embeddingModel", "embeddingVersion");
CREATE INDEX "MemoryEmbedding_sourceContentHash_idx"
  ON "MemoryEmbedding"("sourceContentHash");

ALTER TABLE "MemoryEmbedding"
  ADD CONSTRAINT "MemoryEmbedding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryEmbedding"
  ADD CONSTRAINT "MemoryEmbedding_memoryEventId_fkey"
  FOREIGN KEY ("memoryEventId") REFERENCES "MemoryEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Exact cosine scans are intentional for the current expected memory volume.
-- Add one HNSW index in a later migration only after production cardinality and
-- query latency justify its build and maintenance cost.
