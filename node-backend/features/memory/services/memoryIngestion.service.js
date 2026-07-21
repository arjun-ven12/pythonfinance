const { requireUserId } = require("../../../repositories/ownership");
const { validateEvent } = require("./memoryPolicy");

const SOURCE_MODELS = Object.freeze({
  STRATEGY_EXPERIMENT: "strategyExperiment", STRATEGY_VERSION: "strategyVersion", STRATEGY_RUN: "strategyRun", WALK_FORWARD_RUN: "walkForwardRun", STRATEGY_STRESS_RESULT: "strategyStressResult", MATRIX_REPLAY: "matrixReplaySnapshot", MATRIX_PROPOSAL: "matrixProposal", DEPLOYMENT_SET: "strategyDeploymentSet", PORTFOLIO_SNAPSHOT: "portfolioState", PORTFOLIO_PROPOSAL: "portfolioProposal", RESEARCH_PROJECT: "researchProject", RESEARCH_REPORT: "researchReport", RESEARCH_THESIS: "researchThesis", BROKER_ORDER: "brokerOrder", BROKER_FILL: "brokerFill", PAPER_TRADE: "paperTrade", LEDGER_EVENT: "transactionLedger", APPROVAL: "approvalRequest", SCAN: "scan", OPPORTUNITY: "opportunity", AI_INVOCATION: "aiInvocation", TRADE: "trade",
});

function createMemoryIngestionService({ prisma, logger = console, embeddingService: initialEmbeddingService = null } = {}) {
  let embeddingService = initialEmbeddingService;
  const metrics = { ingested: 0, duplicatesSkipped: 0, validationFailures: 0, failedIntegrations: 0, latencyMs: 0 };
  async function verifyOwnership(db, userId, sourceType, sourceId) {
    const modelName = SOURCE_MODELS[sourceType]; if (!modelName) return;
    const model = db[modelName]; if (!model?.findFirst) throw new Error(`Memory source model is unavailable: ${sourceType}.`);
    const source = await model.findFirst({ where: { id: sourceId, userId }, select: { id: true } });
    if (!source) { const error = new Error(`Memory source ${sourceType}:${sourceId} was not found for this user.`); error.statusCode = 403; throw error; }
  }
  async function persist(db, userId, normalized) {
    await verifyOwnership(db, userId, normalized.sourceType, normalized.sourceId);
    const existing = await db.memoryEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: normalized.dedupeKey } }, include: { links: true } });
    if (existing) { metrics.duplicatesSkipped += 1; return { event: existing, duplicate: true }; }
    try {
      const event = await db.memoryEvent.create({ data: { userId, category: normalized.category, eventType: normalized.eventType, title: normalized.title, summary: normalized.summary, structuredData: normalized.structuredData, sourceType: normalized.sourceType, sourceId: normalized.sourceId, sourceVersion: normalized.sourceVersion, importance: normalized.importance, confidence: normalized.confidence, occurredAt: normalized.occurredAt, retentionState: normalized.retentionState, excludedFromAi: normalized.excludedFromAi, contentHash: normalized.contentHash, dedupeKey: normalized.dedupeKey, createdByType: normalized.createdByType, createdById: normalized.createdById, schemaVersion: normalized.schemaVersion, links: { create: normalized.links.map((link) => ({ ...link, userId })) } }, include: { links: true } });
      metrics.ingested += 1; return { event, duplicate: false };
    } catch (error) {
      if (error?.code === "P2002") { metrics.duplicatesSkipped += 1; const event = await db.memoryEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: normalized.dedupeKey } }, include: { links: true } }); return { event, duplicate: true }; }
      throw error;
    }
  }
  async function recordEvent(input, options = {}) {
    const startedAt = Date.now(); let normalized;
    try { normalized = validateEvent(input); } catch (error) { metrics.validationFailures += 1; throw error; }
    const userId = requireUserId(input.userId);
    try {
      const result = options.transaction ? await persist(options.transaction, userId, normalized) : await prisma.run((db) => db.$transaction((tx) => persist(tx, userId, normalized)));
      metrics.latencyMs += Date.now() - startedAt; logger.info?.("memory_event_ingested", { userId, category: normalized.category, eventType: normalized.eventType, duplicate: result.duplicate, importance: normalized.importance });
      if (result.event?.id && embeddingService) {
        setTimeout(() => {
          embeddingService.enqueueMemory(result.event.id, { userId }).catch((error) => {
            logger.warn?.("memory_embedding_enqueue_failed", { memoryEventId: result.event.id, error: error.message });
          });
        }, 0).unref?.();
      }
      return result;
    } catch (error) { metrics.failedIntegrations += 1; logger.warn?.("memory_event_failed", { userId, eventType: normalized.eventType, sourceType: normalized.sourceType, error: error.message }); if (options.critical) throw error; return { event: null, duplicate: false, error: error.message }; }
  }
  async function recordEvents(events = [], options = {}) { const results = []; for (const event of events.slice(0, 100)) results.push(await recordEvent(event, options)); return results; }
  const domain = (category) => (input, options) => recordEvent({ ...input, category }, options);
  function diagnostics() { const total = metrics.ingested + metrics.duplicatesSkipped + metrics.failedIntegrations; return { ...metrics, averageLatencyMs: total ? Math.round(metrics.latencyMs / total) : 0 }; }
  return { diagnostics, recordEvent, recordEvents, recordFromAiInvocation: domain("AI"), recordFromMatrix: domain("MATRIX"), recordFromPortfolio: domain("PORTFOLIO"), recordFromResearch: domain("RESEARCH"), recordFromStrategy: domain("STRATEGY"), recordFromTrade: (input, options) => recordEvent(input, options), setEmbeddingService(service) { embeddingService = service; } };
}

module.exports = { SOURCE_MODELS, createMemoryIngestionService };
