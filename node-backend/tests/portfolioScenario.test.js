const test = require("node:test");
const assert = require("node:assert/strict");
const { createPortfolioScenarioService } = require("../features/portfolio/services/portfolioScenario.service");
const { validatePortfolioProposal } = require("../features/portfolio/services/portfolioScenarioContract");

function context(overrides = {}) {
  return {
    account: { equity: 100000, cash: 20000 },
    freshness: { stale: false },
    positions: [
      { symbol: "NVDA", sector: "Technology", marketValue: 40000, currentPrice: 200, portfolioWeightPct: 40 },
      { symbol: "MSFT", sector: "Technology", marketValue: 25000, currentPrice: 250, portfolioWeightPct: 25 },
      { symbol: "JNJ", sector: "Healthcare", marketValue: 15000, currentPrice: 150, portfolioWeightPct: 15 },
    ],
    tradingState: {
      strategyAllocations: [
        { id: "a1", strategyId: "s1", strategyName: "Momentum", assignedCapitalPct: 60 },
        { id: "a2", strategyId: "s2", strategyName: "Defensive", assignedCapitalPct: 40 },
      ],
      matrixAllocations: [{ id: "m1", sector: "Technology", regime: "BULL_LOW_VOL", allocationPct: 60 }],
    },
    ...overrides,
  };
}

function action(actionType, values = {}) {
  return {
    actionType, symbol: "", sector: "", strategyId: "", matrixCell: { id: "", sector: "", regime: "" },
    currentValue: 0, proposedValue: 0, unit: "PERCENT", targetWeights: [], ...values,
  };
}

function proposal(actions) {
  return { proposalType: "RISK_REDUCTION", title: "Lower concentration", objective: "Reduce concentration", actions, assumptions: [], rationale: [], evidence: [], confidence: 80, expectedBenefit: "Lower concentration", potentialDownside: "May reduce upside", simulationAvailable: true };
}

test("snapshot scenario reduces a symbol without mutating current context", async () => {
  const input = context();
  const before = JSON.stringify(input);
  const result = await createPortfolioScenarioService().simulate({ userId: "u1", context: input, proposal: proposal([action("REDUCE_POSITION", { symbol: "NVDA", currentValue: 40, proposedValue: 10 })]) });
  assert.equal(result.current.largestPositionPct, 40);
  assert.equal(result.proposed.positions.find((item) => item.symbol === "NVDA").weightPct, 10);
  assert.equal(result.proposed.cashPct, 50);
  assert.equal(result.noChangesApplied, true);
  assert.equal(JSON.stringify(input), before);
});

test("sector cap and cash target scenarios calculate deterministic before and after metrics", async () => {
  const service = createPortfolioScenarioService();
  const sector = await service.simulate({ userId: "u1", context: context(), proposal: proposal([action("SET_SECTOR_CAP", { sector: "Technology", currentValue: 65, proposedValue: 25 })]) });
  assert.equal(sector.proposed.sectorExposure.find((item) => item.sector === "Technology").weightPct, 25);
  const cash = await service.simulate({ userId: "u1", context: context(), proposal: proposal([action("SET_CASH_TARGET", { currentValue: 20, proposedValue: 40 })]) });
  assert.equal(cash.proposed.cashPct, 40);
});

test("equal weight scenario, turnover, and transaction costs are deterministic", async () => {
  const result = await createPortfolioScenarioService().simulate({ userId: "u1", context: context(), proposal: proposal([action("EQUAL_WEIGHT")]) });
  assert.deepEqual(result.proposed.positions.map((item) => item.weightPct), [26.67, 26.67, 26.67]);
  assert.ok(result.turnoverPct > 0);
  assert.ok(result.transactionCosts.estimatedTotal > 0);
  assert.equal(result.transactionCosts.assumptions.source, "STRATEGY_LAB_COST_STRESS");
});

test("strategy allocation uses existing historical simulator while matrix allocation stays static", async () => {
  let historicalCalls = 0;
  const service = createPortfolioScenarioService({ simulateStrategyPortfolio: async () => { historicalCalls += 1; return { generatedAt: "now", metrics: { combinedSharpe: 1.2 } }; } });
  const strategyProposal = proposal([
    action("SET_STRATEGY_WEIGHT", { strategyId: "s1", currentValue: 60, proposedValue: 50 }),
    action("SET_STRATEGY_WEIGHT", { strategyId: "s2", currentValue: 40, proposedValue: 50 }),
  ]);
  const strategy = await service.simulate({ userId: "u1", context: context(), proposal: strategyProposal });
  assert.equal(strategy.method, "HISTORICAL_STRATEGY_SIMULATION");
  assert.equal(historicalCalls, 2);
  const matrix = await service.simulate({ userId: "u1", context: context(), proposal: proposal([action("SET_MATRIX_WEIGHT", { matrixCell: { id: "m1", sector: "Technology", regime: "BULL_LOW_VOL" }, currentValue: 60, proposedValue: 30 })]) });
  assert.equal(matrix.matrixSimulation.method, "STATIC_ALLOCATION_ONLY");
  assert.equal(matrix.matrixSimulation.replayRun, false);
});

test("proposal validation rejects unsupported, unowned, and directionally invalid actions", () => {
  assert.throws(() => validatePortfolioProposal(proposal([action("DELETE_EVERYTHING")]), context()), /unsupported action/i);
  assert.throws(() => validatePortfolioProposal(proposal([action("SET_SYMBOL_WEIGHT", { symbol: "TSLA", proposedValue: 5 })]), context()), /not in the selected provider/i);
  assert.throws(() => validatePortfolioProposal(proposal([action("REDUCE_POSITION", { symbol: "NVDA", proposedValue: 50 })]), context()), /cannot increase/i);
  assert.throws(() => validatePortfolioProposal(proposal([action("ADD_POSITION", { symbol: "TSLA", proposedValue: 5 })]), context()), /current price/i);
});

test("stale inputs are disclosed rather than treated as current", async () => {
  const result = await createPortfolioScenarioService().simulate({ userId: "u1", context: context({ freshness: { stale: true } }), proposal: proposal([action("SET_CASH_TARGET", { proposedValue: 30 })]) });
  assert.equal(result.inputValidity, "STALE_INPUT");
});

test("new positions use platform-resolved market data and reject missing prices", async () => {
  const addProposal = proposal([action("ADD_POSITION", { symbol: "TSLA", sector: "Consumer Discretionary", proposedValue: 5 })]);
  const service = createPortfolioScenarioService({ getQuote: async () => ({ quote: { last: 250 }, lastUpdated: "2026-07-10T04:00:00Z" }) });
  const result = await service.simulate({ userId: "u1", context: context(), proposal: addProposal });
  assert.equal(result.proposed.positions.find((item) => item.symbol === "TSLA").weightPct, 5);
  const unavailable = createPortfolioScenarioService({ getQuote: async () => ({ quote: { last: null } }) });
  await assert.rejects(() => unavailable.simulate({ userId: "u1", context: context(), proposal: addProposal }), /price is unavailable/i);
});
