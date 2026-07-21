const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryRetrievalConfig } = require("../features/memory/config/memoryRetrieval.config");
const { createMemoryContextService } = require("../features/memory/services/memoryContext.service");
const { createMemoryHybridRanker } = require("../features/memory/services/memoryHybridRanker");
const { SOURCE_MODELS } = require("../features/memory/services/memoryIngestion.service");
const { approvalEvent, matrixDeployedEvent, monteCarloEvent, robustnessEvent, scanCompletedEvent, walkForwardEvent } = require("../features/memory/services/memoryEvents");
const { validateEvent } = require("../features/memory/services/memoryPolicy");
const { createMemoryRetrievalService } = require("../features/memory/services/memoryRetrieval.service");

function memory(id, category, eventType, title, summary, links, importance = 85) {
  return { id, category, eventType, title, summary, structuredData: {}, sourceType: category, sourceId: id, sourceVersion: "1", contentHash: `hash-${id}`, importance, confidence: 85, occurredAt: new Date("2026-07-10"), createdByType: "SYSTEM", links, feedback: [] };
}

test("completed strategy research workflows build valid, owned memory events", () => {
  assert.equal(SOURCE_MODELS.WALK_FORWARD_RUN, "walkForwardRun");
  assert.equal(SOURCE_MODELS.STRATEGY_STRESS_RESULT, "strategyStressResult");
  const common = { userId: "user-1", experimentId: "strategy-1", createdAt: new Date("2026-07-10") };
  const events = [
    walkForwardEvent({ ...common, id: "wf-1", mode: "ANCHORED", oosSharpe: 1.2, oosDrawdown: -8, stabilityScore: 76 }, "Momentum"),
    monteCarloEvent({ ...common, id: "mc-1", simulationCount: 500, riskOfRuin: 2, worstReturn: -12 }, "Momentum"),
    robustnessEvent({ ...common, id: "version-8", version: 8 }, "Momentum", { score: 81, deploymentReadiness: { status: "READY" } }),
  ];
  assert.deepEqual(events.map((event) => validateEvent(event).eventType), ["WALK_FORWARD_COMPLETED", "MONTE_CARLO_COMPLETED", "ROBUSTNESS_COMPLETED"]);
  assert.ok(events.every((event) => event.links.some((link) => link.entityType === "STRATEGY" && link.entityId === "strategy-1")));
});

test("scanner and approval memories preserve strategy routing provenance", () => {
  const scan = scanCompletedEvent({ id: "scan-1", userId: "user-1", strategyVersionId: "version-8", generatedAt: new Date() }, { opportunityCount: 1 });
  const approval = approvalEvent({ id: "approval-1", userId: "user-1", symbol: "NVDA", side: "BUY", quantity: 2, status: "APPROVED", updatedAt: new Date(), raw: { strategyVersionId: "version-8" } }, "APPROVAL_APPROVED");
  assert.ok(scan.links.some((link) => link.entityType === "STRATEGY_VERSION" && link.entityId === "version-8"));
  assert.ok(approval.links.some((link) => link.entityType === "STRATEGY_VERSION" && link.entityId === "version-8"));
  const deployment = matrixDeployedEvent({ id: "matrix-1", userId: "user-1", name: "Primary", updatedAt: new Date() }, { id: "proposal-1", title: "Defensive matrix", proposalJson: { actions: [{ proposedStrategyVersionId: "version-8" }] } });
  assert.ok(deployment.links.some((link) => link.entityType === "STRATEGY_VERSION" && link.entityId === "version-8"));
});

test("realistic retrieval queries return the right domain, provenance, and exact entity match", async () => {
  const records = [
    memory("trade-1", "TRADE", "TRADE_CLOSED", "NVDA momentum setup closed", "NVDA momentum setup returned 6.4 percent.", [{ entityType: "SYMBOL", entityId: "NVDA", relationshipType: "RELATED_TO" }], 95),
    memory("edit-1", "STRATEGY", "STRATEGY_EDIT_APPROVED", "Momentum edit approved", "A lower drawdown strategy edit was approved and validated.", [{ entityType: "STRATEGY", entityId: "momentum", relationshipType: "RELATED_TO" }]),
    memory("portfolio-1", "PORTFOLIO", "PORTFOLIO_SNAPSHOT_RECORDED", "Portfolio drawdown increased", "Technology concentration was associated with a larger drawdown.", [{ entityType: "PORTFOLIO", entityId: "portfolio-1", relationshipType: "RELATED_TO" }]),
    memory("matrix-1", "MATRIX", "MATRIX_DEPLOYED", "Bull low volatility matrix deployed", "Momentum was deployed to the Technology bull low volatility cell.", [{ entityType: "MATRIX", entityId: "matrix-1", relationshipType: "DEPLOYED_IN" }], 98),
    memory("research-1", "RESEARCH", "RESEARCH_REPORT_CREATED", "Semiconductor cycle conclusion", "Semiconductor demand evidence was strong but concentration risk remained.", [{ entityType: "SECTOR", entityId: "Semiconductors", relationshipType: "RELATED_TO" }]),
    memory("noise", "SYSTEM", "AI_OUTPUT_CORRECTED", "Unrelated settings note", "A transient unrelated note.", [], 10),
    memory("trade-duplicate", "TRADE", "TRADE_CLOSED", "Duplicate NVDA fill summary", "NVDA momentum setup returned 6.4 percent.", [], 80),
  ];
  records[6].sourceType = records[0].sourceType; records[6].sourceId = records[0].sourceId; records[6].sourceVersion = records[0].sourceVersion;
  const config = buildMemoryRetrievalConfig({ MEMORY_RETRIEVAL_MIN_RELEVANCE: "0.2" });
  const repository = {
    exactCandidates: async (userId, request) => { assert.equal(userId, "user-1"); return records.filter((item) => request.entityFilters.some((filter) => item.links.some((link) => link.entityType === filter.entityType && link.entityId.toUpperCase() === filter.entityId.toUpperCase()))); },
    keywordCandidates: async (_userId, request) => records.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(request.query.toLowerCase().split(" ").find((word) => word.length > 5) || "")).map((item) => ({ memoryEventId: item.id, rank: 0.2 })),
    recentImportant: async (_userId, request) => records.filter((item) => !request.categories.length || request.categories.includes(item.category)),
    hydrate: async (_userId, ids) => records.filter((item) => ids.includes(item.id)), revision: async () => "audit-1",
  };
  const vectorRepository = { searchSimilar: async ({ userId }) => { assert.equal(userId, "user-1"); return []; } };
  const auditService = { record: async () => ({ id: "audit-1" }), get: async () => null, diagnostics: async () => ({}) };
  const service = createMemoryRetrievalService({ repository, vectorRepository, embeddingProvider: { embed: async () => ({ vectors: [[0.1, 0.2, 0.3]] }) }, ranker: createMemoryHybridRanker({ config, now: () => new Date("2026-07-13").getTime() }), contextService: createMemoryContextService(), auditService, config });
  const cases = [
    ["Have I traded similar setups before?", "TRADE"], ["Which strategy edits worked best?", "STRATEGY"], ["Why did my portfolio drawdown increase?", "PORTFOLIO"], ["Have I deployed a similar matrix before?", "MATRIX"], ["What did I previously conclude about semiconductors?", "RESEARCH"],
  ];
  for (const [query, category] of cases) {
    const result = await service.retrieve("user-1", { query, categories: [category], minimumSimilarity: 0.3 });
    assert.equal(result.memories[0].category, category);
    assert.ok(result.memories[0].provenance.sourceId);
    assert.equal(result.memories.some((item) => item.memoryEventId === "noise"), false);
  }
  const exact = await service.retrieve("user-1", { query: "NVDA history", categories: ["TRADE"], entityFilters: [{ entityType: "SYMBOL", entityId: "NVDA" }] });
  assert.equal(exact.memories[0].memoryEventId, "trade-1");
  assert.ok(exact.memories[0].whyRetrieved.some((reason) => reason.includes("exact symbol")));
  assert.equal(exact.memories.filter((item) => item.provenance.sourceId === "trade-1").length, 1);
});
