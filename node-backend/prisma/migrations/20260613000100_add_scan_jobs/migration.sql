CREATE TYPE "ScanJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMEOUT'
);

CREATE TYPE "ScanJobType" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TABLE "ScanJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ScanJobStatus" NOT NULL DEFAULT 'QUEUED',
  "type" "ScanJobType" NOT NULL DEFAULT 'MANUAL',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "timeoutAt" TIMESTAMP(3),
  "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentStage" TEXT,
  "symbolsProcessed" INTEGER NOT NULL DEFAULT 0,
  "symbolsTotal" INTEGER NOT NULL DEFAULT 0,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "pid" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScanJob_userId_createdAt_idx"
ON "ScanJob"("userId", "createdAt");

CREATE INDEX "ScanJob_userId_type_status_idx"
ON "ScanJob"("userId", "type", "status");

CREATE INDEX "ScanJob_status_timeoutAt_idx"
ON "ScanJob"("status", "timeoutAt");

ALTER TABLE "ScanJob"
ADD CONSTRAINT "ScanJob_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
