const { requireUserId } = require("../../../repositories/ownership");
const { CATEGORIES, FEEDBACK_TYPES, RETENTION_STATES, memoryError } = require("./memoryPolicy");

function parseDate(value, label) { if (!value) return null; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw memoryError(`${label} must be a valid date.`); return parsed; }
function createMemoryQueryService({ prisma, ingestionService, embeddingService = null }) {
  async function requireEvent(userId, id) { const event = await prisma.run((db) => db.memoryEvent.findFirst({ where: { id: String(id), userId: requireUserId(userId) }, include: { links: true, feedback: { orderBy: { createdAt: "desc" } } } })); if (!event) throw memoryError("Memory event not found.", 404); return event; }
  function filters(userId, query = {}) {
    const where = { userId: requireUserId(userId) };
    if (query.category) { const category = String(query.category).toUpperCase(); if (!CATEGORIES.includes(category)) throw memoryError("Unsupported memory category."); where.category = category; }
    if (query.eventType) where.eventType = String(query.eventType).toUpperCase();
    if (query.retentionState) { const state = String(query.retentionState).toUpperCase(); if (!RETENTION_STATES.includes(state)) throw memoryError("Unsupported retention state."); where.retentionState = state; }
    const from = parseDate(query.from, "from"); const to = parseDate(query.to, "to"); if (from || to) where.occurredAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (query.minImportance !== undefined) { const score = Number(query.minImportance); if (!Number.isFinite(score) || score < 0 || score > 100) throw memoryError("minImportance must be between 0 and 100."); where.importance = { gte: score }; }
    const entityType = query.entityType ? String(query.entityType).toUpperCase() : null; const entityId = query.entityId || query.symbol || query.sector || query.regime; if (entityId) where.links = { some: { userId, entityType: entityType || (query.symbol ? "SYMBOL" : query.sector ? "SECTOR" : query.regime ? "REGIME" : undefined), entityId: String(entityId) } };
    return where;
  }
  async function list(userId, query = {}) { const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25)); const where = filters(userId, query); const [events, total] = await prisma.run((db) => Promise.all([db.memoryEvent.findMany({ where, include: { links: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), db.memoryEvent.count({ where })])); return { events, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }; }
  async function timeline(userId, query = {}) { if (!query.entityId && !query.symbol && !query.sector && !query.regime) throw memoryError("Timeline requires a linked entity or symbol, sector, or regime."); return list(userId, { ...query, pageSize: Math.min(100, Number(query.pageSize) || 50) }); }
  async function important(userId, limit = 20) { return prisma.run((db) => db.memoryEvent.findMany({ where: { userId: requireUserId(userId), retentionState: "ACTIVE", importance: { gte: 60 } }, include: { links: true }, orderBy: [{ importance: "desc" }, { occurredAt: "desc" }], take: Math.min(100, Math.max(1, Number(limit) || 20)) })); }
  async function feedback(userId, id, body = {}) { await requireEvent(userId, id); const feedbackType = String(body.feedbackType || "").toUpperCase(); if (!FEEDBACK_TYPES.includes(feedbackType)) throw memoryError("Unsupported memory feedback type."); const comment = body.comment ? String(body.comment).trim().slice(0, 1000) : null; const created = await prisma.run((db) => db.$transaction(async (tx) => { const record = await tx.memoryFeedback.create({ data: { memoryEventId: String(id), userId: requireUserId(userId), feedbackType, comment } }); if (feedbackType === "EXCLUDE_FROM_AI") await tx.memoryEvent.update({ where: { id: String(id) }, data: { excludedFromAi: true, retentionState: "EXCLUDED" } }); return record; })); if (feedbackType === "EXCLUDE_FROM_AI") await embeddingService?.excludeMemory(String(id), userId).catch(() => null); return created; }
  async function setRetention(userId, id, retentionState) { await requireEvent(userId, id); const updated = await prisma.run((db) => db.memoryEvent.update({ where: { id: String(id) }, data: { retentionState, excludedFromAi: retentionState === "EXCLUDED" } })); if (retentionState === "ACTIVE") await embeddingService?.enqueueMemory(String(id), { userId }).catch(() => null); else await embeddingService?.excludeMemory(String(id), userId).catch(() => null); return updated; }
  async function diagnostics(userId = null) {
    const where = userId ? { userId: requireUserId(userId) } : {};
    const [total, byCategory, byType, byRetention, importance, missingLinks, embeddings, retrievalAudits] = await prisma.run((db) => Promise.all([
      db.memoryEvent.count({ where }),
      db.memoryEvent.groupBy({ by: ["category"], where, _count: true }),
      db.memoryEvent.groupBy({ by: ["eventType"], where, _count: true, _max: { occurredAt: true }, orderBy: { _count: { eventType: "desc" } }, take: 100 }),
      db.memoryEvent.groupBy({ by: ["retentionState"], where, _count: true }),
      db.memoryEvent.aggregate({ where, _avg: { importance: true }, _min: { importance: true }, _max: { importance: true } }),
      db.memoryEvent.count({ where: { ...where, links: { none: {} } } }),
      db.memoryEmbedding.groupBy({ by: ["status"], where, _count: true }),
      db.memoryRetrievalAudit.count({ where }),
    ]));
    const countByType = Object.fromEntries(byType.map((row) => [row.eventType, row._count]));
    const families = {
      strategy: ["STRATEGY_CREATED", "STRATEGY_VERSION_CREATED", "STRATEGY_EDIT_PROPOSED", "STRATEGY_EDIT_APPROVED"],
      validation: ["STRATEGY_VALIDATION_PASSED", "STRATEGY_VALIDATION_FAILED", "STRATEGY_DEPLOYMENT_BLOCKED"],
      deploymentRollback: ["STRATEGY_DEPLOYED", "STRATEGY_DEACTIVATED", "STRATEGY_ROLLED_BACK", "MATRIX_DEPLOYED"],
      scanner: ["SCAN_COMPLETED", "OPPORTUNITY_IDENTIFIED", "OPPORTUNITY_ROUTED", "OPPORTUNITY_REJECTED", "SIGNAL_DOWNGRADED"],
      approval: ["APPROVAL_CREATED", "APPROVAL_APPROVED", "APPROVAL_REJECTED", "APPROVAL_EXPIRED"],
      brokerOrder: ["ORDER_SUBMITTED", "ORDER_ACKNOWLEDGED", "ORDER_PARTIALLY_FILLED", "ORDER_FILLED", "ORDER_CANCELLED", "ORDER_REJECTED", "ORDER_EXPIRED", "ORDER_SUBMIT_FAILED"],
      fill: ["FILL_RECORDED", "INTERNAL_PAPER_FILL_RECORDED"],
      internalPaperTrade: ["TRADE_OPENED", "TRADE_PARTIALLY_CLOSED", "TRADE_CLOSED", "TRADE_OUTCOME_RECORDED"],
      portfolioSnapshot: ["PORTFOLIO_SNAPSHOT_RECORDED"],
      portfolioOutcome: ["PORTFOLIO_OUTCOME_RECORDED", "PORTFOLIO_RISK_STATE_CHANGED", "PORTFOLIO_DRAWDOWN_THRESHOLD_CROSSED"],
      allocation: ["PORTFOLIO_ALLOCATION_CHANGED", "MATRIX_ALLOCATION_CHANGED"],
      research: ["BACKTEST_COMPLETED", "WALK_FORWARD_COMPLETED", "ROBUSTNESS_COMPLETED", "MONTE_CARLO_COMPLETED", "RESEARCH_REPORT_CREATED"],
      aiDecision: ["AI_RECOMMENDATION_CREATED", "AI_RECOMMENDATION_ACCEPTED", "AI_RECOMMENDATION_REJECTED", "AI_OUTPUT_CORRECTED"],
    };
    const coverage = Object.fromEntries(Object.entries(families).map(([family, eventTypes]) => {
      const count = eventTypes.reduce((sum, eventType) => sum + (countByType[eventType] || 0), 0);
      const timestamps = byType.filter((row) => eventTypes.includes(row.eventType) && row._max?.occurredAt).map((row) => row._max.occurredAt);
      return [family, { count, status: count > 0 ? "COVERED" : "NO_EVENTS", lastEmittedAt: timestamps.sort().at(-1) || null }];
    }));
    const covered = Object.values(coverage).filter((item) => item.count > 0).length;
    return {
      total, byCategory, byType, byRetention, importance,
      ingestion: ingestionService?.diagnostics() || null,
      coverage: { health: total === 0 ? "EMPTY" : covered === Object.keys(coverage).length ? "HEALTHY" : "PARTIAL", coveredFamilies: covered, totalFamilies: Object.keys(coverage).length, families: coverage, warnings: Object.entries(coverage).filter(([, value]) => value.count === 0).map(([family]) => `No ${family} memory events have been recorded.`) },
      integrity: { eventsWithoutLinks: missingLinks },
      embeddings,
      retrievalAudits,
    };
  }
  return { archive: (userId, id) => setRetention(userId, id, "ARCHIVED"), diagnostics, exclude: (userId, id) => setRetention(userId, id, "EXCLUDED"), feedback, get: requireEvent, important, list, timeline };
}

module.exports = { createMemoryQueryService };
