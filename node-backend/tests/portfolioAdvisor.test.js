const test = require("node:test");
const assert = require("node:assert/strict");
const { createPortfolioAdvisorService } = require("../features/portfolio/services/portfolioAdvisor.service");
const { createPortfolioScenarioService } = require("../features/portfolio/services/portfolioScenario.service");

const accountEvidence = {
  sourceType: "POSITION", sourceId: "INTERNAL_PAPER:NVDA", metricName: "PortfolioWeightPct", metricValue: "40",
  symbol: "NVDA", strategy: "", timestamp: "", dateRange: "", interpretation: "Current weight.", strength: "MEDIUM",
};

function buildContext() {
  return {
    provider: "INTERNAL_PAPER", executionMode: "INTERNAL_PAPER",
    account: { equity: 100000, cash: 20000 }, freshness: { stale: false }, limitations: [],
    positions: [
      { symbol: "NVDA", sector: "Technology", marketValue: 40000, currentPrice: 200, portfolioWeightPct: 40 },
      { symbol: "JNJ", sector: "Healthcare", marketValue: 40000, currentPrice: 100, portfolioWeightPct: 40 },
    ],
    tradingState: { reconciliation: { matched: true }, strategyAllocations: [], matrixAllocations: [] },
    availableEvidence: [accountEvidence],
  };
}

function action(target = 15) {
  return { actionType: "REDUCE_POSITION", symbol: "NVDA", sector: "", strategyId: "", matrixCell: { id: "", sector: "", regime: "" }, currentValue: 40, proposedValue: target, unit: "PERCENT", targetWeights: [] };
}

function proposal(title = "Reduce NVDA", target = 15) {
  return { proposalType: "RISK_REDUCTION", title, objective: "Reduce concentration", actions: [action(target)], assumptions: [], rationale: ["NVDA is concentrated."], evidence: [accountEvidence], confidence: 80, expectedBenefit: "Lower concentration.", potentialDownside: "Less upside participation.", simulationAvailable: true };
}

test("advisor returns validated evidence-backed recommendation proposals", async () => {
  const service = createPortfolioAdvisorService({
    contextService: { buildContext: async () => buildContext() }, scenarioService: createPortfolioScenarioService(),
    aiService: { isConfigured: () => true, generatePortfolioRecommendations: async () => ({
      summary: "Concentration is elevated.", portfolioConcernOrObjective: "Reduce risk", recommendations: [proposal()],
      evidence: [accountEvidence], confidenceScore: 82, dataModelLimitations: [], availableUserActions: ["Simulate this proposal."],
    }) },
  });
  const result = await service.recommend("user-1", { question: "Reduce risk" });
  assert.equal(result.response.recommendations[0].actions[0].actionType, "REDUCE_POSITION");
  assert.equal(result.response.evidence.length, 1);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.noChangesApplied, true);
});

test("advisor runs deterministic scenario before AI interpretation", async () => {
  let interpretedComparison = null;
  const service = createPortfolioAdvisorService({
    contextService: { buildContext: async () => buildContext() }, scenarioService: createPortfolioScenarioService(),
    aiService: {
      isConfigured: () => true,
      generatePortfolioScenarioProposal: async () => proposal(),
      interpretPortfolioScenario: async (_userId, payload) => {
        interpretedComparison = payload.deterministicComparison;
        return {
          summary: "Concentration falls.", portfolioConcernOrObjective: "Reduce concentration", recommendation: "Review the trade-off.",
          proposedActions: ["Reduce NVDA."], evidence: [payload.scenarioEvidence[0]], expectedBenefits: ["Lower concentration."],
          risksTradeoffs: ["Turnover and costs."], confidenceScore: 78, dataModelLimitations: [], availableUserActions: ["Try another target."],
        };
      },
    },
  });
  const result = await service.scenario("user-1", { question: "Reduce NVDA to 15%" });
  assert.equal(interpretedComparison.proposed.positions.find((item) => item.symbol === "NVDA").weightPct, 15);
  assert.equal(result.comparison.noChangesApplied, true);
  assert.ok(result.response.evidence.length > 0);
});

test("advisor compares two deterministic proposals without executing either", async () => {
  const service = createPortfolioAdvisorService({
    contextService: { buildContext: async () => buildContext() }, scenarioService: createPortfolioScenarioService(),
    aiService: {
      isConfigured: () => true,
      comparePortfolioProposals: async (_userId, payload) => ({
        summary: "Option A reduces more concentration.", portfolioConcernOrObjective: "Compare concentration targets", recommendation: "Review both options.",
        proposedActions: [], evidence: [payload.scenarioEvidence[0]], expectedBenefits: [], risksTradeoffs: [], confidenceScore: 75,
        dataModelLimitations: [], availableUserActions: ["Simulate another target."], rankedOptions: [
          { rank: 1, title: "A", expectedImpact: "Larger reduction", riskReduction: "Higher", portfolioDisruption: "Higher", turnoverPct: payload.options[0].comparison.turnoverPct, confidence: 75, tradeoffs: [] },
          { rank: 2, title: "B", expectedImpact: "Smaller reduction", riskReduction: "Lower", portfolioDisruption: "Lower", turnoverPct: payload.options[1].comparison.turnoverPct, confidence: 70, tradeoffs: [] },
        ],
      }),
    },
  });
  const result = await service.compare("user-1", { proposals: [proposal("A", 10), proposal("B", 25)] });
  assert.equal(result.options.length, 2);
  assert.equal(result.response.rankedOptions.length, 2);
  assert.ok(result.options.every((option) => option.comparison.noChangesApplied));
});
