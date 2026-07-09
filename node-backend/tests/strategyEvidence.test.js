const assert = require("node:assert/strict");
const test = require("node:test");

const { buildWalkForwardSummary } = require("../features/strategyLab/services/walkForwardService");
const { createRegimeAnalysisService } = require("../features/strategyLab/services/regimeAnalysisService");
const { createMonteCarloService } = require("../features/strategyLab/services/monteCarloService");
const { createStrategyLeaderboardService } = require("../features/strategyLab/services/strategyLeaderboardService");
const { createStrategyMemoryService } = require("../features/strategyLab/services/strategyMemoryService");
const { createPortfolioSimulationService } = require("../features/strategyLab/services/portfolioSimulationService");
const { buildAllocationMatrixEvidence } = require("../features/strategyLab/services/strategyConditioningService");

test("walk-forward summary measures OOS decay and stability", () => {
  const result = buildWalkForwardSummary({
    mode: "ANCHORED",
    segments: [
      { phase: "TRAIN", returnPct: 20, sharpe: 1.2, maxDrawdown: -8 },
      { phase: "VALIDATE", returnPct: 12, sharpe: 0.9, maxDrawdown: -10 },
      { phase: "TEST", returnPct: 6, sharpe: 0.5, maxDrawdown: -12 },
    ],
  });

  assert.equal(result.summary.isReturn, 16);
  assert.equal(result.summary.oosReturn, 6);
  assert.equal(result.summary.returnDecay, 10);
  assert.ok(result.summary.stabilityScore > 0);
  assert.equal(result.summary.outOfRegimeStability.pass, false);
});

test("allocation matrix evidence keeps thin cells inactive", () => {
  const evidence = buildAllocationMatrixEvidence({
    cellBreakdown: [
      { sector: "Technology", regime: "BULL_LOW_VOL", sampleCount: 44, hitRate: 57, realizedReturn: 8.2 },
      { sector: "Utilities", regime: "BEAR_HIGH_VOL", sampleCount: 8, hitRate: 62, realizedReturn: 4.1 },
    ],
    envelope: {
      sectors: ["Technology", "Utilities"],
      regimes: ["BULL_LOW_VOL", "BEAR_HIGH_VOL"],
    },
    allocationMatrix: {
      "Technology::BULL_LOW_VOL": { active: true, strategyName: "Momentum Lab" },
      "Utilities::BEAR_HIGH_VOL": { active: true, strategyName: "Defensive Trend" },
    },
  });

  const activeCell = evidence.cells.find((cell) => cell.key === "Technology::BULL_LOW_VOL");
  const thinCell = evidence.cells.find((cell) => cell.key === "Utilities::BEAR_HIGH_VOL");

  assert.equal(activeCell.active, true);
  assert.equal(thinCell.active, false);
  assert.equal(thinCell.inactiveReason, "insufficient evidence");
});

test("regime analysis aggregates trade outcomes by regime", () => {
  const service = createRegimeAnalysisService({ prisma: null });
  const regimes = service.summarizeTradesByRegime([
    { pnl: 10, raw: { regime: "BULL_LOW_VOL" } },
    { pnl: -5, raw: { regime: "BULL_LOW_VOL" } },
    { pnl: 3, raw: { regime: "BEAR_HIGH_VOL" } },
  ]);

  const bull = regimes.find((item) => item.regime === "BULL_LOW_VOL");
  assert.equal(bull.tradeCount, 2);
  assert.equal(bull.winRate, 50);
  assert.equal(bull.profitFactor, 2);
});

test("monte carlo simulation is deterministic for a fixed seed", () => {
  const service = createMonteCarloService({ prisma: null });
  const randomA = (() => {
    let state = 42;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  })();
  const randomB = (() => {
    let state = 42;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  })();

  assert.deepEqual(
    service.runSimulation([2, -1, 3, -2, 1], randomA),
    service.runSimulation([2, -1, 3, -2, 1], randomB)
  );
});

test("leaderboard assigns categories from evidence score", () => {
  const service = createStrategyLeaderboardService({ prisma: null });
  const scored = service.scoreExperiment({
    id: "strategy-1",
    name: "Stable Momentum",
    status: "TESTED",
    settingsJson: { robustness: { score: 85 } },
    runs: [{ id: "run-1", returnPct: 22, sharpe: 1.4, maxDrawdown: -8, tradeCount: 40 }],
    walkForwardRuns: [{ stabilityScore: 82 }],
    stressResults: [{ probability20Drawdown: 4 }],
  });

  assert.equal(scored.category, "Deploy Candidate");
  assert.ok(scored.score >= 80);
});

test("strategy memory diffs version settings", () => {
  const service = createStrategyMemoryService({ prisma: null });
  assert.deepEqual(service.diffSettings(
    { emaFast: 20, rsiThreshold: 55 },
    { emaFast: 25, rsiThreshold: 55 }
  ), [
    { key: "emaFast", before: 20, after: 25 },
  ]);
});

test("strategy portfolio simulation creates equal and risk parity weights", async () => {
  const experiments = [
    {
      id: "a",
      name: "A",
      runs: [{
        returnPct: 10,
        sharpe: 1.1,
        maxDrawdown: -10,
        settingsJson: { equity_curve: [{ date: "1", equity: 100 }, { date: "2", equity: 110 }, { date: "3", equity: 108 }] },
      }],
    },
    {
      id: "b",
      name: "B",
      runs: [{
        returnPct: 4,
        sharpe: 0.6,
        maxDrawdown: -20,
        settingsJson: { equity_curve: [{ date: "1", equity: 100 }, { date: "2", equity: 95 }, { date: "3", equity: 97 }] },
      }],
    },
  ];
  const service = createPortfolioSimulationService({
    prisma: {
      run: async (callback) => callback({
        strategyExperiment: {
          findMany: async () => experiments,
        },
      }),
    },
  });

  assert.deepEqual(service.buildWeights(experiments, "EQUAL"), { a: 0.5, b: 0.5 });
  const riskParity = service.buildWeights(experiments, "RISK_PARITY");
  assert.ok(riskParity.a > riskParity.b);
  assert.equal(Number((riskParity.a + riskParity.b).toFixed(6)), 1);
  const combined = await service.simulateStrategyPortfolio({
    userId: "user-1",
    body: { experimentIds: ["a", "b"], allocationMode: "EQUAL" },
  });
  assert.equal(combined.equityCurve.length, 3);
  assert.equal(typeof combined.metrics.correlation, "number");
});
