const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPortfolioCopilotContextService,
} = require("../features/portfolio/services/portfolioCopilotContext.service");
const {
  createPortfolioCopilotService,
} = require("../features/portfolio/services/portfolioCopilot.service");
const {
  normalizePortfolioEvidenceReferences,
} = require("../features/portfolio/services/portfolioCopilotEvidence.service");
const { RESPONSE_SCHEMAS } = require("../services/ai/AIService");
const { validateSchema } = require("../features/ai/services/ai.validators");

function buildSession(provider = "INTERNAL_PAPER") {
  return {
    provider,
    executionMode: provider === "INTERNAL_PAPER" ? "INTERNAL_PAPER" : "PAPER",
    accountId: provider === "INTERNAL_PAPER" ? null : "broker-account-1",
    account: { currency: "USD", lastUpdated: "2026-07-10T04:00:00.000Z" },
    balances: { equity: 100000, cash: 30000, buyingPower: 60000, currency: "USD" },
    positions: [{ symbol: "AAPL", quantity: 100, averageCost: 150, lastPrice: 200, marketValue: 20000, sector: "Technology" }],
    openOrders: [{ id: "order-1", symbol: "AAPL", status: "OPEN" }],
    trades: [],
    performance: { realizedPnl: 250, feesPaid: 4 },
  };
}

function createContextHarness(provider = "INTERNAL_PAPER") {
  let riskReads = 0;
  let portfolioReads = 0;
  let sessionOptions = null;
  const service = createPortfolioCopilotContextService({
    tradingSessionService: { getTradingSession: async (_userId, options) => {
      sessionOptions = options;
      return buildSession(provider);
    } },
    buildRiskDashboardFromDatabase: async () => {
      riskReads += 1;
      return { risk: { current_drawdown_pct: 2.5 } };
    },
    getPortfolioForUser: async () => {
      portfolioReads += 1;
      return { reconciliation: { id: "rec-1", status: "MATCHED", matched: true, lastChecked: "2026-07-10T04:00:00.000Z" } };
    },
    listApprovalRequests: async () => [
      { id: "internal", status: "PENDING", symbol: "MSFT", raw: {} },
      { id: "broker", status: "PENDING", symbol: "NVDA", raw: { provider: "IBKR" } },
    ],
    prisma: { run: async (callback) => callback({
      strategyDeploymentSet: { findFirst: async () => null },
      portfolioState: { findMany: async () => [] },
    }) },
    now: () => new Date("2026-07-10T04:05:00.000Z"),
  });
  return { service, reads: () => ({ riskReads, portfolioReads, sessionOptions }) };
}

test("portfolio context uses only Internal Paper data in Internal Paper mode", async () => {
  const harness = createContextHarness();
  const context = await harness.service.buildContext("user-1", { workflow: "OVERVIEW" });
  assert.equal(context.provider, "INTERNAL_PAPER");
  assert.deepEqual(context.tradingState.pendingApprovals.map((item) => item.id), ["internal"]);
  assert.equal(context.performance.drawdownPct, 2.5);
  assert.deepEqual(harness.reads(), { riskReads: 1, portfolioReads: 1, sessionOptions: { forceRefresh: false } });
});

test("broker context does not read or mix Internal Paper risk and ledger state", async () => {
  const harness = createContextHarness("IBKR");
  const context = await harness.service.buildContext("user-1", { workflow: "QUESTION", question: "Explain risk" });
  assert.equal(context.provider, "IBKR");
  assert.equal(context.performance.drawdownPct, null);
  assert.deepEqual(context.tradingState.pendingApprovals.map((item) => item.id), ["broker"]);
  assert.deepEqual(harness.reads(), { riskReads: 0, portfolioReads: 0, sessionOptions: { forceRefresh: false } });
});

test("portfolio evidence validation rejects invented evidence", () => {
  assert.throws(() => normalizePortfolioEvidenceReferences([
    { sourceType: "POSITION", sourceId: "fake", metricName: "MarketValue", metricValue: "999" },
  ], []), /unavailable or mismatched portfolio evidence/i);
});

test("portfolio copilot returns grounded evidence and caps stale confidence", async () => {
  const evidence = {
    sourceType: "ACCOUNT_SNAPSHOT", sourceId: "INTERNAL_PAPER", metricName: "Equity",
    metricValue: "100000", symbol: "", strategy: "", timestamp: "", dateRange: "",
    interpretation: "Current equity.", strength: "HIGH",
  };
  const service = createPortfolioCopilotService({
    contextService: { buildContext: async () => ({
      provider: "INTERNAL_PAPER", executionMode: "INTERNAL_PAPER", availableEvidence: [evidence],
      limitations: [], freshness: { stale: true }, tradingState: { reconciliation: { matched: true } },
    }) },
    aiService: {
      isConfigured: () => true,
      generatePortfolioOverview: async () => ({
        summary: "Account overview.", keyFindings: ["Equity is available."], reasoning: ["Uses account snapshot."],
        evidence: [evidence], confidenceScore: 90, dataLimitations: [],
        suggestedNextQuestion: "Which position is largest?",
        claimClassification: { facts: [], platformMetrics: [], interpretations: [], unavailableInformation: [] },
      }),
    },
  });
  const result = await service.generateOverview("user-1");
  assert.equal(result.response.evidence.length, 1);
  assert.equal(result.response.confidenceScore, 60);
});

test("portfolio copilot rejects empty questions before building context", async () => {
  let contextReads = 0;
  const service = createPortfolioCopilotService({
    contextService: { buildContext: async () => { contextReads += 1; return {}; } },
    aiService: { isConfigured: () => true },
  });
  await assert.rejects(() => service.ask("user-1", { question: "  " }), /question is required/i);
  assert.equal(contextReads, 0);
});

test("portfolio copilot schema rejects out-of-bounds confidence and malformed evidence", () => {
  const valid = {
    summary: "Summary", keyFindings: [], reasoning: [], evidence: [], confidenceScore: 70,
    dataLimitations: [], suggestedNextQuestion: "What is my cash percentage?",
    claimClassification: { facts: [], platformMetrics: [], interpretations: [], unavailableInformation: [] },
  };
  assert.throws(
    () => validateSchema(RESPONSE_SCHEMAS.portfolioCopilotOverview.schema, { ...valid, confidenceScore: 101 }),
    /must be <= 100/i
  );
  assert.throws(
    () => validateSchema(RESPONSE_SCHEMAS.portfolioCopilotOverview.schema, {
      ...valid,
      evidence: [{
        sourceType: "INVENTED", sourceId: "", metricName: "X", metricValue: "1",
        symbol: "", strategy: "", timestamp: "", dateRange: "", interpretation: "X", strength: "HIGH",
      }],
    }),
    /allowed enum value/i
  );
});
