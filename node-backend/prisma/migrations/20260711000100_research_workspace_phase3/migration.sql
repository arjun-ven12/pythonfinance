CREATE TABLE "ResearchProject" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "researchType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "description" TEXT,
  "scopeJson" JSONB NOT NULL, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ResearchProject_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchReport" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL, "reportType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "executiveSummary" TEXT NOT NULL, "structuredContent" JSONB NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "dataFreshness" JSONB NOT NULL,
  "affectedEntities" JSONB NOT NULL, "limitationsJson" JSONB NOT NULL, "promptTemplateId" TEXT,
  "promptVersion" TEXT NOT NULL, "model" TEXT, "aiInvocationId" TEXT, "versionNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchNote" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL, "content" TEXT NOT NULL,
  "noteType" TEXT NOT NULL DEFAULT 'USER_NOTE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchQuestion" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL, "question" TEXT NOT NULL,
  "answerReportId" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchQuestion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchThesis" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL, "statement" TEXT NOT NULL,
  "status" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "supportingEvidence" JSONB NOT NULL,
  "opposingEvidence" JSONB NOT NULL, "unresolvedQuestions" JSONB NOT NULL, "affectedEntities" JSONB NOT NULL,
  "versionNumber" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchThesis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResearchProject_userId_slug_key" ON "ResearchProject"("userId", "slug");
CREATE INDEX "ResearchProject_userId_status_updatedAt_idx" ON "ResearchProject"("userId", "status", "updatedAt");
CREATE UNIQUE INDEX "ResearchReport_projectId_reportType_versionNumber_key" ON "ResearchReport"("projectId", "reportType", "versionNumber");
CREATE INDEX "ResearchReport_userId_createdAt_idx" ON "ResearchReport"("userId", "createdAt");
CREATE INDEX "ResearchReport_projectId_createdAt_idx" ON "ResearchReport"("projectId", "createdAt");
CREATE INDEX "ResearchNote_projectId_createdAt_idx" ON "ResearchNote"("projectId", "createdAt");
CREATE INDEX "ResearchNote_userId_createdAt_idx" ON "ResearchNote"("userId", "createdAt");
CREATE INDEX "ResearchQuestion_projectId_createdAt_idx" ON "ResearchQuestion"("projectId", "createdAt");
CREATE INDEX "ResearchQuestion_userId_status_idx" ON "ResearchQuestion"("userId", "status");
CREATE UNIQUE INDEX "ResearchThesis_projectId_versionNumber_key" ON "ResearchThesis"("projectId", "versionNumber");
CREATE INDEX "ResearchThesis_userId_createdAt_idx" ON "ResearchThesis"("userId", "createdAt");
CREATE INDEX "ResearchThesis_projectId_createdAt_idx" ON "ResearchThesis"("projectId", "createdAt");
ALTER TABLE "ResearchProject" ADD CONSTRAINT "ResearchProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchQuestion" ADD CONSTRAINT "ResearchQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchQuestion" ADD CONSTRAINT "ResearchQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchQuestion" ADD CONSTRAINT "ResearchQuestion_answerReportId_fkey" FOREIGN KEY ("answerReportId") REFERENCES "ResearchReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResearchThesis" ADD CONSTRAINT "ResearchThesis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchThesis" ADD CONSTRAINT "ResearchThesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
