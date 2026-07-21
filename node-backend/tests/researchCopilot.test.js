const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchContextService } = require("../features/research/services/researchContext.service");
const { createResearchCopilotService, normalizeResearchScore } = require("../features/research/services/researchCopilot.service");
const { normalizeResearchEvidenceReferences } = require("../features/research/services/researchEvidence.service");
const { RESPONSE_SCHEMAS } = require("../services/ai/AIService");
const { validateSchema } = require("../features/ai/services/ai.validators");

function harness({ stale = false, news = true, crossSystem = false, large = false } = {}) {
  const seenUsers = [];
  const contextService = createResearchContextService({
    getQuotes: async (userId, symbols) => { seenUsers.push(userId); return symbols.map((symbol) => ({ symbol, provider: "TEST", source: "Broker market data", isStale: stale, lastUpdated: "2026-07-10T04:00:00Z", quote: { last: 100, changePercent: symbol === "NVDA" ? 5 : 1 }, raw: large ? { payload: "x".repeat(150_000) } : undefined })); },
    readScanResultsWithHistory: async (userId) => { seenUsers.push(userId); return {
      scan_id: "scan-1", generated_at: "2026-07-10T04:00:00Z", market_regime: { regime: "BULL_LOW_VOL" },
      opportunities: [{ id: "opp-1", symbol: "NVDA", sector: "Technology", signal: "BUY", opportunity_score: 88, reasons: [large ? "Momentum".repeat(30_000) : "Momentum"], news_events: news ? [{ id: "news-1", headline: "NVIDIA announces platform update", source: "Company investor relations", publishedAt: "2026-07-10T03:00:00Z" }] : [] }],
    }; },
    buildDataHealth: async (userId) => { seenUsers.push(userId); return { is_stale: stale }; },
    watchlistRepository: { list: async (userId) => { seenUsers.push(userId); return [{ id: "w-1", symbol: "NVDA", notes: large ? "note".repeat(50_000) : "" }]; } },
    portfolioContextService: { buildContext: async (userId) => { seenUsers.push(userId); return {
      provider: "INTERNAL_PAPER", positions: [{ id: "p-1", symbol: "NVDA", sector: "Technology", portfolioWeightPct: 30, priceTimestamp: "2026-07-10T04:00:00Z" }],
      tradingState: { strategyAllocations: [{ id: "s-1", strategyName: "Momentum", assignedCapitalPct: 60 }], matrixAllocations: [{ id: "m-1", sector: "Technology", regime: "BULL_LOW_VOL", allocationPct: 50 }] },
      freshness: { stale, portfolioSnapshotTimestamp: "2026-07-10T04:00:00Z" },
    }; } },
    now: () => new Date("2026-07-10T04:05:00Z"),
    prisma: crossSystem ? {
      strategyExperiment: { findMany: async () => [{ id: "exp-1", name: "Momentum", status: "VALIDATED", updatedAt: "2026-07-10T02:00:00Z", runs: [{ id: "run-1", returnPct: 12, sharpe: 1.4, maxDrawdown: 8, tradeCount: 42, createdAt: "2026-07-09T00:00:00Z" }], walkForwardRuns: [{ id: "wf-1", oosReturn: 7, oosSharpe: 1.1, stabilityScore: 82, createdAt: "2026-07-09T00:00:00Z" }], stressResults: [{ id: "mc-1", medianReturn: 9, worstReturn: -6, riskOfRuin: 2, createdAt: "2026-07-09T00:00:00Z" }], versions: [{ id: "v-1", deploymentStatus: "VALIDATED", createdAt: "2026-07-09T00:00:00Z" }] }] },
      strategyDeploymentSet: { findUnique: async () => ({ id: "dep-1", name: "Primary Matrix", updatedAt: "2026-07-10T02:00:00Z", routes: [{ id: "route-1", sector: "Technology", regime: "BULL_LOW_VOL", status: "ACTIVE", allocationPct: 50, updatedAt: "2026-07-10T02:00:00Z", selectedExperiment: { name: "Momentum" } }], snapshots: [{ id: "snap-1", createdAt: "2026-07-09T00:00:00Z", simulationJson: { metrics: { combinedReturn: 10, combinedSharpe: 1.3 } }, matrixJson: { metrics: { combinedReturn: 11, combinedDrawdown: 7 } } }] }) },
    } : undefined,
  });
  return { contextService, seenUsers };
}

test("research context ranks portfolio, watchlist, scanner, market, regime, and news evidence", async () => {
  const state = harness();
  const context = await state.contextService.build("user-1", { workflow: "SYMBOL_RESEARCH", question: "Why did NVDA move?", symbol: "NVDA" });
  assert.equal(context.symbol, "NVDA");
  assert.ok(context.availableEvidence.some((item) => item.sourceType === "PORTFOLIO_POSITION" && item.relevanceScore === 95));
  assert.ok(context.availableEvidence.some((item) => item.sourceType === "NEWS" && item.sourceQuality === "HIGH"));
  assert.ok(context.availableEvidence.some((item) => item.sourceType === "MARKET_REGIME"));
  assert.ok(context.availableEvidence.length <= 100);
  assert.ok(state.seenUsers.every((userId) => userId === "user-1"));
});

test("upcoming-events context reports unavailable calendar evidence honestly", async () => {
  const context = await harness({ news: false }).contextService.build("user-1", { workflow: "UPCOMING_EVENTS", question: "What is tomorrow?" });
  assert.ok(context.limitations.some((item) => /calendar data is unavailable/i.test(item)));
  assert.ok(context.freshness.staleSources.includes("NEWS_UNAVAILABLE"));
});

test("research evidence normalization rejects hallucinated citations", () => {
  assert.throws(() => normalizeResearchEvidenceReferences([{ sourceType: "NEWS", sourceId: "fake", metricName: "Headline", metricValue: "Invented" }], []), /unavailable or mismatched/i);
});

test("research confidence fractions are normalized to the 0-100 scale", () => {
  assert.equal(normalizeResearchScore(0.99), 99); assert.equal(normalizeResearchScore(0.74), 74); assert.equal(normalizeResearchScore(84), 84);
});

test("research context strips raw payloads and remains below the AI context limit", async () => {
  const context = await harness({ large: true }).contextService.build("user-1", { workflow: "DEEP_RESEARCH", question: "Research NVDA" });
  assert.ok(Buffer.byteLength(JSON.stringify(context), "utf8") < 128_000);
  assert.equal(context.market.quotes.some((quote) => Object.hasOwn(quote, "raw")), false);
  assert.ok(context.scanner.opportunities[0].reasons[0].length <= 300);
});

test("deep research context connects saved strategy, deployment, matrix replay, and portfolio simulation evidence", async () => {
  const context = await harness({ crossSystem: true }).contextService.build("user-1", { workflow: "DEEP_RESEARCH", question: "Research semiconductors", theme: "Semiconductors" });
  for (const sourceType of ["BACKTEST", "WALK_FORWARD", "MONTE_CARLO", "LIFECYCLE", "DEPLOYMENT", "MATRIX_REPLAY", "PORTFOLIO_SIMULATION"]) {
    assert.ok(context.availableEvidence.some((item) => item.sourceType === sourceType), `missing ${sourceType}`);
  }
  assert.equal(context.strategyResearch[0].name, "Momentum");
  assert.equal(context.deployment.routes[0].regime, "BULL_LOW_VOL");
});

test("deep research workflow dispatches through the centralized AI feature", async () => {
  let called = false;
  const context = await harness().contextService.build("user-1", { workflow: "DEEP_RESEARCH", question: "Research AI infrastructure" });
  const service = createResearchCopilotService({ contextService: { build: async () => context }, aiService: { isConfigured: () => true, deepResearch: async () => { called = true; return { executiveSummary: "Research summary", keyFindings: [], whyItMatters: [], evidence: [], relationshipMap: { nodes: [], edges: [] }, report: { currentSituation: [], bullCase: [], bearCase: [], majorCatalysts: [], majorRisks: [], historicalContext: [], macroEnvironment: [], sectorAnalysis: [], relevantCompanies: [], keyUnknowns: ["News unavailable"] }, affectedSystems: { portfolio: [], strategies: [], matrix: [], scanner: [], watchlist: [] }, risksAlternativeInterpretations: [], confidenceScore: 50, dataFreshness: context.freshness, suggestedFollowUpQuestions: [], limitations: [] }; } } });
  const result = await service.run("user-1", { question: "Research AI infrastructure" }, "DEEP_RESEARCH");
  assert.equal(called, true); assert.equal(result.researchOnly, true); assert.deepEqual(result.response.report.keyUnknowns, ["News unavailable"]);
});

test("research service uses workflow feature, grounds evidence, and caps stale confidence", async () => {
  const context = await harness({ stale: true }).contextService.build("user-1", { workflow: "SYMBOL_RESEARCH", symbol: "NVDA", question: "Why?" });
  const cited = context.availableEvidence[0];
  let called = false;
  const service = createResearchCopilotService({
    contextService: { build: async () => context },
    aiService: { isConfigured: () => true, symbolResearch: async () => { called = true; return {
      executiveSummary: "NVDA moved with current evidence.", keyFindings: [], whyItMatters: [], evidence: [cited], risksAlternativeInterpretations: [], confidenceScore: 90,
      dataFreshness: { marketDataTimestamp: "", newsTimestamp: "", scannerTimestamp: "", portfolioSnapshotTimestamp: "", regimeTimestamp: "", staleSources: ["MARKET_DATA"] }, suggestedFollowUpQuestions: [], limitations: [],
    }; } },
  });
  const result = await service.run("user-1", { question: "Why?", symbol: "NVDA" }, "SYMBOL_RESEARCH");
  assert.equal(called, true); assert.equal(result.response.evidence.length, 1); assert.equal(result.response.confidenceScore, 65); assert.equal(result.researchOnly, true);
});

test("research structured output rejects unsupported evidence sources", () => {
  const valid = { executiveSummary: "X", keyFindings: [], whyItMatters: [], evidence: [], relationshipMap: { nodes: [], edges: [] }, report: { currentSituation: [], bullCase: [], bearCase: [], majorCatalysts: [], majorRisks: [], historicalContext: [], macroEnvironment: [], sectorAnalysis: [], relevantCompanies: [], keyUnknowns: [] }, affectedSystems: { portfolio: [], strategies: [], matrix: [], scanner: [], watchlist: [] }, risksAlternativeInterpretations: [], confidenceScore: 50, dataFreshness: { marketDataTimestamp: "", newsTimestamp: "", scannerTimestamp: "", portfolioSnapshotTimestamp: "", regimeTimestamp: "", staleSources: [] }, suggestedFollowUpQuestions: [], limitations: [] };
  assert.throws(() => validateSchema(RESPONSE_SCHEMAS.symbolResearch.schema, { ...valid, evidence: [{ sourceType: "SOCIAL_RUMOR", sourceId: "x", sourceName: "x", sourceQuality: "LOW", symbol: "", sector: "", theme: "", metricName: "x", metricValue: "x", timestamp: "", dateRange: "", interpretation: "x", strength: "LOW", relevanceScore: 1 }] }), /allowed enum value/i);
});
