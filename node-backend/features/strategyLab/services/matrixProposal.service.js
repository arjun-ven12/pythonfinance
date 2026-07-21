const { validateMatrixProposalShape } = require("./matrixScenarioContract");

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createMatrixProposalService({ prisma, matrixAdvisorService, scenarioService, matrixCopilotService, updateDeploymentAllocation, memoryIngestionService = null }) {
  async function findOwned(userId, id, includeDeleted = false) {
    const record = await prisma.run((db) => db.matrixProposal.findFirst({
      where: { id: String(id), userId, ...(includeDeleted ? {} : { deletedAt: null }) },
      include: { decisions: { orderBy: { createdAt: "desc" } } },
    }));
    if (!record) throw httpError("Matrix proposal not found.", 404);
    return record;
  }

  async function deploymentVersion(userId, deploymentSetId) {
    const record = await prisma.run((db) => db.strategyDeploymentSet.findFirst({ where: { id: deploymentSetId, userId } }));
    if (!record) throw httpError("Deployment set not found or is not owned by this user.", 404);
    return record;
  }

  async function list(userId, { includeDeleted = false } = {}) {
    return prisma.run((db) => db.matrixProposal.findMany({
      where: { userId, ...(includeDeleted ? {} : { deletedAt: null }) },
      include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }));
  }

  async function save(userId, body = {}) {
    const proposal = validateMatrixProposalShape(body.proposal || {});
    const scenario = await matrixAdvisorService.scenario(userId, { proposal, question: body.sourcePrompt || proposal.objective });
    const deployment = await deploymentVersion(userId, proposal.deploymentSetId);
    const record = await prisma.run((db) => db.matrixProposal.create({ data: {
      userId,
      deploymentSetId: proposal.deploymentSetId,
      title: String(body.title || proposal.title).trim(),
      objective: proposal.objective,
      proposalJson: proposal,
      simulationJson: scenario.comparison,
      explanationJson: scenario.response,
      evidenceJson: scenario.response?.evidence || proposal.evidence || [],
      sourcePrompt: body.sourcePrompt || null,
      deploymentUpdatedAt: deployment.updatedAt,
      confidence: Number(proposal.confidence),
    }, include: { decisions: true } }));
    if (memoryIngestionService) { const { aiRecommendationEvent, matrixProposalEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordEvents([matrixProposalEvent(record), aiRecommendationEvent(record, "MATRIX_PROPOSAL")]); }
    return record;
  }

  async function rename(userId, id, title) {
    await findOwned(userId, id);
    const normalized = String(title || "").trim();
    if (!normalized || normalized.length > 140) throw httpError("Proposal title must be between 1 and 140 characters.");
    return prisma.run((db) => db.matrixProposal.update({ where: { id: String(id) }, data: { title: normalized } }));
  }

  async function duplicate(userId, id) {
    const source = await findOwned(userId, id);
    const deployment = await deploymentVersion(userId, source.deploymentSetId);
    return prisma.run((db) => db.matrixProposal.create({ data: {
      userId,
      deploymentSetId: source.deploymentSetId,
      parentProposalId: source.id,
      title: `${source.title} Copy`,
      objective: source.objective,
      proposalJson: source.proposalJson,
      simulationJson: source.simulationJson,
      explanationJson: source.explanationJson,
      evidenceJson: source.evidenceJson,
      sourcePrompt: source.sourcePrompt,
      promptVersion: source.promptVersion,
      simulationVersion: source.simulationVersion,
      deploymentUpdatedAt: deployment.updatedAt,
      confidence: source.confidence,
    } }));
  }

  async function setDeleted(userId, id, deleted) {
    await findOwned(userId, id, true);
    return prisma.run((db) => db.matrixProposal.update({ where: { id: String(id) }, data: { deletedAt: deleted ? new Date() : null } }));
  }

  async function decide(userId, id, status, reason = null) {
    const proposalRecord = await findOwned(userId, id);
    if (!["REJECTED", "APPROVED"].includes(status)) throw httpError("Unsupported matrix proposal decision.");
    if (proposalRecord.status !== "DRAFT") throw httpError(`Matrix proposal is already ${proposalRecord.status.toLowerCase()}.`, 409);
    if (status === "REJECTED") {
      const rejected = await prisma.run((db) => db.$transaction(async (tx) => {
        await tx.matrixProposalDecision.create({ data: { proposalId: proposalRecord.id, actorUserId: userId, status, reason } });
        return tx.matrixProposal.update({ where: { id: proposalRecord.id }, data: { status } });
      }));
      if (memoryIngestionService) { const { aiRecommendationEvent, matrixProposalEvent } = require("../../memory/services/memoryEvents"); const source = { ...proposalRecord, ...rejected, userId }; await memoryIngestionService.recordEvents([matrixProposalEvent(source, "MATRIX_PROPOSAL_REJECTED"), aiRecommendationEvent(source, "MATRIX_PROPOSAL", "REJECTED")]); }
      return rejected;
    }

    const deployment = await deploymentVersion(userId, proposalRecord.deploymentSetId);
    if (deployment.updatedAt.getTime() !== proposalRecord.deploymentUpdatedAt.getTime()) {
      throw httpError("The live deployment matrix changed after this draft was saved. Duplicate or regenerate the proposal before approval.", 409);
    }
    const proposal = validateMatrixProposalShape(proposalRecord.proposalJson);
    const context = await matrixCopilotService.buildContext(userId, "MATRIX_AUDIT", proposal.objective);
    const comparison = await scenarioService.simulate({ userId, dashboard: context.dashboard, latestReplay: context.latestReplay, proposal });
    if (!comparison.validation?.valid) throw httpError("Matrix proposal no longer passes deterministic validation.", 409);
    const proposed = scenarioService.applyProposal(context.dashboard, proposal);
    const deployed = await updateDeploymentAllocation({
      actorUserId: userId,
      userId,
      body: {
        allocationMethod: context.dashboard.allocationMethod,
        guardrails: context.dashboard.guardrails?.config,
        strategies: proposed.strategies,
        matrix: proposed.matrix,
        reasonNote: `Approved Matrix Copilot proposal: ${proposalRecord.title}`,
      },
    });
    await prisma.run((db) => db.$transaction(async (tx) => {
      await tx.matrixProposalDecision.create({ data: { proposalId: proposalRecord.id, actorUserId: userId, status: "APPROVED", reason, metadataJson: { deterministicValidation: comparison.validation, simulationMethod: comparison.simulationMethod } } });
      await tx.matrixProposal.update({ where: { id: proposalRecord.id }, data: { status: "APPROVED", simulationJson: comparison } });
    }));
    const approved = await findOwned(userId, id);
    if (memoryIngestionService) { const { aiRecommendationEvent, matrixDeployedEvent, matrixProposalEvent } = require("../../memory/services/memoryEvents"); const deploymentRecord = await deploymentVersion(userId, approved.deploymentSetId); await memoryIngestionService.recordEvents([matrixProposalEvent(approved, "MATRIX_PROPOSAL_APPROVED"), aiRecommendationEvent(approved, "MATRIX_PROPOSAL", "ACCEPTED"), matrixDeployedEvent(deploymentRecord, approved)]); }
    return { proposal: approved, deployment: deployed };
  }

  return { approve: (userId, id, reason) => decide(userId, id, "APPROVED", reason), duplicate, get: findOwned, list, reject: (userId, id, reason) => decide(userId, id, "REJECTED", reason), remove: (userId, id) => setDeleted(userId, id, true), rename, restore: (userId, id) => setDeleted(userId, id, false), save };
}

module.exports = { createMatrixProposalService };
