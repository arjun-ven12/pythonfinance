CREATE TABLE "MatrixReplaySnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT,
  "period" TEXT,
  "symbolsJson" JSONB NOT NULL,
  "resultJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatrixReplaySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatrixReplaySnapshot_userId_createdAt_idx" ON "MatrixReplaySnapshot"("userId", "createdAt");
CREATE INDEX "MatrixReplaySnapshot_userId_deploymentSetId_createdAt_idx" ON "MatrixReplaySnapshot"("userId", "deploymentSetId", "createdAt");
ALTER TABLE "MatrixReplaySnapshot" ADD CONSTRAINT "MatrixReplaySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
