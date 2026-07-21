const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMatrixAudit, createMatrixCopilotService, summarizeReplay } = require("../features/strategyLab/services/matrixCopilot.service");
const { RESPONSE_SCHEMAS } = require("../services/ai/AIService");
const { validateSchema } = require("../features/ai/services/ai.validators");

const dashboard = {
  generatedAt: "2026-07-11T03:00:00Z", deploymentSetId: "dep-1", allocationMethod: "MANUAL_WEIGHT",
  guardrails: { valid: true, violations: [] }, activeSet: { owner: { name: "Momentum", version: 2 }, routedStrategies: [] },
  strategies: [{ experimentId: "s-1", strategyVersionId: "v-1", name: "Momentum", assignedCapitalPct: 60, readinessScore: 80, validationScore: 75, robustnessScore: 70 }, { experimentId: "s-2", strategyVersionId: "v-2", name: "Defensive", assignedCapitalPct: 20, readinessScore: 65, validationScore: 60, robustnessScore: 62 }],
  matrix: { sectors: ["Technology", "Healthcare"], regimes: ["BULL", "BEAR"], cells: [
    { key: "Technology::BULL", sector: "Technology", regime: "BULL", status: "ACTIVE", selectedExperimentId: "s-1", strategyName: "Momentum", allocationPct: 35 },
    { key: "Technology::BEAR", sector: "Technology", regime: "BEAR", status: "ACTIVE", selectedExperimentId: "s-1", strategyName: "Momentum", allocationPct: 25 },
    { key: "Healthcare::BULL", sector: "Healthcare", regime: "BULL", status: "SIT_OUT", allocationPct: 0 },
    { key: "Healthcare::BEAR", sector: "Healthcare", regime: "BEAR", status: "PENDING", selectedExperimentId: "s-2", strategyName: "Defensive", allocationPct: 20 },
  ] }, simulation: { metrics: { expectedReturn: 8, expectedDrawdown: 10, sharpe: 1.1, capitalUsage: 80 } }, rebalance: {},
};

function output(evidence = []) { return { executiveSummary: "The matrix is concentrated in Technology.", keyFindings: ["Coverage is partial."], matrixOverview: { health: "REVIEW", coverageSummary: "Half active.", allocationSummary: "Twenty percent idle.", deploymentSummary: "Momentum is reused.", replaySummary: "Latest replay is positive." }, cellAnalysis: [], strategyAnalysis: ["Momentum has two cells."], allocationAnalysis: ["Idle capital is 20%."], replayEvidence: ["Replay return is 5%."], portfolioInteraction: ["Simulation usage is 80%."], currentDeployment: ["Deployment owner is Momentum."], risks: ["Technology concentration."], evidence, confidenceScore: 0.78, limitations: [], suggestedInvestigations: ["Inspect Technology cells."] }; }

test("matrix audit deterministically finds coverage, duplicate use, sector concentration, and idle capital", () => {
  const audit = buildMatrixAudit(dashboard); assert.equal(audit.coveragePct, 50); assert.equal(audit.idleCapitalPct, 20); assert.equal(audit.duplicateStrategies[0].cells, 2); assert.equal(audit.sectorConcentration[0].allocationPct, 60); assert.equal(audit.unusedStrategies[0].strategyName, "Defensive");
});

test("matrix replay snapshots exclude raw curves and trades", () => {
  const summary = summarizeReplay({ result: { deploymentVersionId: "dep-1", symbols: ["NVDA"], total_return_pct: 5, equity_curve: Array(100).fill(1), trades: Array(100).fill({}), strategy_utilization: [{ strategyKey: "s-1", bars: 20 }] } });
  assert.equal(summary.total_return_pct, 5); assert.equal(Object.hasOwn(summary, "equity_curve"), false); assert.equal(Object.hasOwn(summary, "trades"), false);
});

test("matrix copilot grounds responses in dashboard and latest saved replay without mutation", async () => {
  const snapshot = { id: "replay-1", userId: "u-1", deploymentSetId: "dep-1", period: "1y", createdAt: "2026-07-11T02:00:00Z", resultJson: { total_return_pct: 5, max_drawdown_pct: 7, sharpe: 1.2, completed_trades: 30, win_rate_pct: 55 } };
  const db = { matrixReplaySnapshot: { findFirst: async ({ where }) => where.userId === "u-1" ? snapshot : null, create: async () => { throw new Error("unexpected write"); } } };
  let called = false; const service = createMatrixCopilotService({ prisma: { run: (fn) => fn(db) }, getDeploymentAllocationDashboard: async () => dashboard, aiService: { isConfigured: () => true, matrixAudit: async (_userId, context) => { called = true; const evidence = context.availableEvidence.find((item) => item.sourceType === "MATRIX_REPLAY" && item.metricName === "TotalReturnPct"); return output([evidence]); } } });
  const result = await service.run("u-1", { workflow: "MATRIX_AUDIT" }); assert.equal(called, true); assert.equal(result.readOnly, true); assert.equal(result.response.evidence[0].metricValue, "5"); assert.equal(result.response.confidenceScore, 78);
});

test("missing replay is disclosed and malformed matrix output is rejected", async () => {
  const service = createMatrixCopilotService({ prisma: { run: (fn) => fn({ matrixReplaySnapshot: { findFirst: async () => null } }) }, getDeploymentAllocationDashboard: async () => dashboard, aiService: { isConfigured: () => true, matrixReplayAnalysis: async () => output([]) } });
  const result = await service.run("u-1", { workflow: "MATRIX_REPLAY_ANALYSIS" }); assert.ok(result.response.limitations.some((item) => /no saved matrix replay/i.test(item)));
  assert.throws(() => validateSchema(RESPONSE_SCHEMAS.matrixAudit.schema, { ...output([]), confidenceScore: 101 }), /<= 100/i);
});
