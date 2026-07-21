const { requireUserId } = require("../../../repositories/ownership");
const { validatePortfolioProposal } = require("./portfolioScenarioContract");
const { randomUUID } = require("node:crypto");

function latestStatus(record) {
  return record?.decisions?.[0]?.status || "PENDING";
}

function serialize(record) {
  if (!record) return null;
  return { ...record, approvalStatus: latestStatus(record) };
}

function createPortfolioProposalService({ prisma, contextService, scenarioService, memoryIngestionService = null }) {
  async function getOwned(userId, id) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) => db.portfolioProposal.findFirst({
      where: { id: String(id), userId: ownerId },
      include: { decisions: { orderBy: { createdAt: "desc" } } },
    }));
  }

  async function list(userId) {
    const ownerId = requireUserId(userId);
    const records = await prisma.run((db) => db.portfolioProposal.findMany({
      where: { userId: ownerId }, orderBy: { createdAt: "desc" }, take: 50,
      include: { decisions: { orderBy: { createdAt: "desc" }, take: 5 } },
    }));
    return records.map(serialize);
  }

  async function save(userId, body = {}) {
    const ownerId = requireUserId(userId);
    const context = await contextService.buildContext(ownerId, { question: body.sourcePrompt || body.proposal?.objective, workflow: "PROPOSE_SCENARIO" });
    validatePortfolioProposal(body.proposal, context, { allowUnresolvedAdds: true });
    const comparison = await scenarioService.simulate({ userId: ownerId, context, proposal: body.proposal });
    let parentProposalId = null;
    if (body.parentProposalId) {
      const parent = await getOwned(ownerId, body.parentProposalId);
      if (!parent) {
        const error = new Error("Parent portfolio proposal not found.");
        error.statusCode = 404;
        throw error;
      }
      parentProposalId = parent.id;
    }
    const proposalId = /^[0-9a-f-]{36}$/i.test(String(body.proposal.proposalId || "")) ? body.proposal.proposalId : randomUUID();
    const durableProposal = { ...body.proposal, proposalId };
    const record = await prisma.run((db) => db.$transaction(async (tx) => {
      const created = await tx.portfolioProposal.create({ data: {
        id: proposalId,
        userId: ownerId, parentProposalId, title: body.proposal.title, objective: body.proposal.objective,
        provider: context.provider, executionMode: context.executionMode || null,
        proposalJson: durableProposal, simulationJson: comparison,
        explanationJson: body.explanation || null, evidenceJson: body.evidence || body.proposal.evidence || [],
        sourcePrompt: body.sourcePrompt || null, aiFeature: "portfolioScenarioProposal",
        aiModel: body.aiModel || null, promptVersion: "v1", simulationVersion: "portfolio-scenario-v1",
        snapshotTimestamp: context.freshness?.portfolioSnapshotTimestamp ? new Date(context.freshness.portfolioSnapshotTimestamp) : null,
        marketPriceTimestamp: context.freshness?.marketPriceTimestamp ? new Date(context.freshness.marketPriceTimestamp) : null,
        confidence: Number(body.confidence ?? body.proposal.confidence) || null,
      } });
      await tx.portfolioProposalDecision.create({ data: {
        proposalId: created.id, actorUserId: ownerId, status: "PENDING",
        reason: parentProposalId ? "Saved revised portfolio proposal for review." : "Saved portfolio proposal for review.",
        metadataJson: { requiredApprovals: body.proposal.requiredApprovals || ["USER_REVIEW"] },
      } });
      return created;
    }));
    const saved = serialize(await getOwned(ownerId, record.id));
    if (memoryIngestionService) { const { aiRecommendationEvent, portfolioProposalEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordEvents([portfolioProposalEvent(saved), aiRecommendationEvent(saved, "PORTFOLIO_PROPOSAL")]); }
    return saved;
  }

  async function decide(userId, id, status, reason = "") {
    const ownerId = requireUserId(userId);
    const record = await getOwned(ownerId, id);
    if (!record) {
      const error = new Error("Portfolio proposal not found.");
      error.statusCode = 404;
      throw error;
    }
    if (latestStatus(record) !== "PENDING") {
      const error = new Error("Only pending portfolio proposals can be approved or rejected.");
      error.statusCode = 409;
      throw error;
    }
    if (status === "APPROVED") {
      const context = await contextService.buildContext(ownerId, { question: record.objective, workflow: "PROPOSE_SCENARIO" });
      if (context.provider !== record.provider) {
        const error = new Error("The selected provider differs from the proposal provider. Generate a new proposal in the current context.");
        error.statusCode = 409;
        throw error;
      }
      if (context.freshness?.stale || context.tradingState?.reconciliation?.matched === false) {
        const error = new Error("Portfolio data must be current and reconciled before proposal approval.");
        error.statusCode = 409;
        throw error;
      }
      validatePortfolioProposal(record.proposalJson, context, { allowUnresolvedAdds: true });
      await scenarioService.simulate({ userId: ownerId, context, proposal: record.proposalJson });
    }
    await prisma.run((db) => db.portfolioProposalDecision.create({ data: {
      proposalId: record.id, actorUserId: ownerId, status,
      reason: String(reason || (status === "APPROVED" ? "Approved by user for the future portfolio workflow." : "Rejected by user.")),
      metadataJson: { executionCreated: false, approvalRequestCreated: false },
    } }));
    const decided = serialize(await getOwned(ownerId, record.id));
    if (memoryIngestionService) { const { aiRecommendationEvent, portfolioProposalEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordEvents([portfolioProposalEvent(decided, status === "APPROVED" ? "PORTFOLIO_PROPOSAL_APPROVED" : "PORTFOLIO_PROPOSAL_REJECTED"), aiRecommendationEvent(decided, "PORTFOLIO_PROPOSAL", status === "APPROVED" ? "ACCEPTED" : "REJECTED")]); }
    return decided;
  }

  return {
    approve: (userId, id, reason) => decide(userId, id, "APPROVED", reason),
    getOwned,
    list,
    reject: (userId, id, reason) => decide(userId, id, "REJECTED", reason),
    save,
  };
}

module.exports = { createPortfolioProposalService, latestStatus, serialize };
