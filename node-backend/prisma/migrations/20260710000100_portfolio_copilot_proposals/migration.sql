CREATE TABLE "PortfolioProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "parentProposalId" TEXT,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "executionMode" TEXT,
  "proposalJson" JSONB NOT NULL,
  "simulationJson" JSONB NOT NULL,
  "explanationJson" JSONB,
  "evidenceJson" JSONB,
  "sourcePrompt" TEXT,
  "aiFeature" TEXT NOT NULL DEFAULT 'portfolioScenarioProposal',
  "aiModel" TEXT,
  "promptVersion" TEXT NOT NULL DEFAULT 'v1',
  "simulationVersion" TEXT NOT NULL DEFAULT 'portfolio-snapshot-v1',
  "snapshotTimestamp" TIMESTAMP(3),
  "marketPriceTimestamp" TIMESTAMP(3),
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioProposalDecision" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioProposalDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioProposal_userId_createdAt_idx" ON "PortfolioProposal"("userId", "createdAt");
CREATE INDEX "PortfolioProposal_userId_provider_createdAt_idx" ON "PortfolioProposal"("userId", "provider", "createdAt");
CREATE INDEX "PortfolioProposal_parentProposalId_idx" ON "PortfolioProposal"("parentProposalId");
CREATE INDEX "PortfolioProposalDecision_proposalId_createdAt_idx" ON "PortfolioProposalDecision"("proposalId", "createdAt");
CREATE INDEX "PortfolioProposalDecision_actorUserId_createdAt_idx" ON "PortfolioProposalDecision"("actorUserId", "createdAt");
CREATE INDEX "PortfolioProposalDecision_status_createdAt_idx" ON "PortfolioProposalDecision"("status", "createdAt");

ALTER TABLE "PortfolioProposal" ADD CONSTRAINT "PortfolioProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioProposal" ADD CONSTRAINT "PortfolioProposal_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "PortfolioProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioProposalDecision" ADD CONSTRAINT "PortfolioProposalDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "PortfolioProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioProposalDecision" ADD CONSTRAINT "PortfolioProposalDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_portfolio_proposal_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Portfolio proposals are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PortfolioProposal_immutable"
BEFORE UPDATE OR DELETE ON "PortfolioProposal"
FOR EACH ROW EXECUTE FUNCTION prevent_portfolio_proposal_mutation();
