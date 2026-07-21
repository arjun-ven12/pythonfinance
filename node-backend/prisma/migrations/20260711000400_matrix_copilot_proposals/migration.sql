CREATE TABLE "MatrixProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentSetId" TEXT NOT NULL,
  "parentProposalId" TEXT,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "proposalJson" JSONB NOT NULL,
  "simulationJson" JSONB NOT NULL,
  "explanationJson" JSONB,
  "evidenceJson" JSONB,
  "sourcePrompt" TEXT,
  "promptVersion" TEXT NOT NULL DEFAULT 'v1',
  "simulationVersion" TEXT NOT NULL DEFAULT 'matrix-scenario-v1',
  "deploymentUpdatedAt" TIMESTAMP(3) NOT NULL,
  "confidence" DOUBLE PRECISION,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatrixProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatrixProposalDecision" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatrixProposalDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatrixProposal_userId_status_createdAt_idx" ON "MatrixProposal"("userId", "status", "createdAt");
CREATE INDEX "MatrixProposal_deploymentSetId_createdAt_idx" ON "MatrixProposal"("deploymentSetId", "createdAt");
CREATE INDEX "MatrixProposal_parentProposalId_idx" ON "MatrixProposal"("parentProposalId");
CREATE INDEX "MatrixProposalDecision_proposalId_createdAt_idx" ON "MatrixProposalDecision"("proposalId", "createdAt");
CREATE INDEX "MatrixProposalDecision_actorUserId_createdAt_idx" ON "MatrixProposalDecision"("actorUserId", "createdAt");
ALTER TABLE "MatrixProposal" ADD CONSTRAINT "MatrixProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatrixProposal" ADD CONSTRAINT "MatrixProposal_deploymentSetId_fkey" FOREIGN KEY ("deploymentSetId") REFERENCES "StrategyDeploymentSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatrixProposal" ADD CONSTRAINT "MatrixProposal_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "MatrixProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatrixProposalDecision" ADD CONSTRAINT "MatrixProposalDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MatrixProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatrixProposalDecision" ADD CONSTRAINT "MatrixProposalDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
