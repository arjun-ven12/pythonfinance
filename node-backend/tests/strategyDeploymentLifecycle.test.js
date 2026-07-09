const assert = require("node:assert/strict");
const test = require("node:test");

const createStrategyLabController = require("../features/strategyLab/controllers/strategyLab.controller");
const createStrategyLabService = require("../features/strategyLab/services/strategyLab.service");
const {
  assignStrategyToActiveSet,
  buildCanonicalDeployment,
  resolveCanonicalDeploymentState,
} = require("../features/strategyLab/services/strategyLifecycleService");

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("new versions from active experiments default to candidate instead of silently active", async () => {
  const createdPayloads = [];
  const service = createStrategyLabService({
    appendOutput: (current, chunk) => current + chunk,
    getBacktestSymbols: () => ["AAPL"],
    getProcessFailureMessage: (_message, stderr) => stderr || "failed",
    getPythonPath: () => "python3",
    parseJsonOutput: JSON.parse,
    prisma: null,
    pythonEngineDir: "",
    spawn: () => {
      throw new Error("not used");
    },
    validateSymbol: (value) => value,
    strategyStorage: {
      hydrateStrategyExperimentRecord: (value) => value,
      hydrateStrategyVersionRecord: (value) => value,
      encryptVersionForStorage: (record) => record,
    },
  });

  const db = {
    strategyVersion: {
      findFirst: async () => ({ version: 3 }),
      create: async ({ data }) => {
        createdPayloads.push(data);
        return data;
      },
    },
  };

  await service.createStrategyVersion(
    db,
    "user-1",
    {
      id: "exp-1",
      name: "Momentum Lab",
      description: "Active strategy",
      status: "ACTIVE",
      settingsJson: {
        emaFast: 20,
        emaSlow: 50,
        rsiThreshold: 55,
        atrStopMultiple: 1.5,
        atrTakeProfitMultiple: 8,
        trailingStopAtrMultiple: 2,
        riskPerTrade: 0.01,
        signalThreshold: 60,
      },
    },
    "Edited active strategy"
  );

  assert.equal(createdPayloads[0].deploymentStatus, "CANDIDATE");
});

test("canonical deployment object reflects the active owner and runtime linkage", () => {
  const deployment = buildCanonicalDeployment({
    deploymentSet: {
      id: "set-1",
      ownerExperimentId: "exp-1",
      ownerStrategyVersionId: "version-3",
    },
    activeStrategy: {
      experimentId: "exp-1",
      strategyVersionId: "version-3",
      version: 3,
      name: "Momentum Lab",
      description: "ready",
      readiness: { canActivate: true },
      activationRules: { minimumTrades: 30 },
      strategyJson: {
        executable: {
          allocationMatrix: {
            "Technology::BULL_LOW_VOL": {
              strategyVersionId: "version-3",
            },
          },
        },
      },
    },
    activeVersion: {
      id: "version-3",
      experimentId: "exp-1",
      version: 3,
      activatedAt: "2026-07-08T00:00:00.000Z",
    },
  });

  assert.equal(deployment.active, true);
  assert.equal(deployment.owner.strategyVersionId, "version-3");
  assert.equal(deployment.runtimeConfiguration.strategyVersionId, "version-3");
});

test("active-set assignment recovers a missing target strategy version", async () => {
  let createVersionCalled = false;
  const targetExperiment = {
    id: "exp-missing-version",
    userId: "user-1",
    name: "Legacy Strategy",
    description: "",
    status: "CANDIDATE",
    settingsJson: {
      strategyJson: {
        executable: {
          envelope: {
            sectors: ["Technology"],
            regimes: ["BULL_LOW_VOL"],
          },
        },
      },
    },
    versions: [],
  };

  await assert.rejects(
    assignStrategyToActiveSet({
      prisma: {
        run: async (callback) =>
          callback({
            strategyExperiment: {
              findFirst: async ({ where }) =>
                where.id === targetExperiment.id ? targetExperiment : null,
            },
            validationSignal: {
              findMany: async () => [],
            },
          }),
      },
      userId: "user-1",
      targetExperimentId: targetExperiment.id,
      contexts: [{ sector: "Healthcare", regime: "BULL_LOW_VOL" }],
      readActiveStrategyConfig: async () => ({ active: false, experimentId: null }),
      writeActiveStrategyConfig: async () => ({}),
      createStrategyVersion: async () => {
        createVersionCalled = true;
        return {
          id: "version-recovered",
          experimentId: targetExperiment.id,
          version: 1,
          strategyJson: targetExperiment.settingsJson.strategyJson,
        };
      },
    }),
    /outside this strategy's allowed sector envelope/i
  );

  assert.equal(createVersionCalled, true);
});

test("controller deactivates deployment through the canonical deactivation path", async () => {
  let deactivateCalled = false;
  const controller = createStrategyLabController({
    buildExperimentBacktestConfig: () => ({}),
    buildStrategyComparisonMetrics: () => ({}),
    buildStrategyComparisonWinner: () => ({}),
    buildStrategyExperimentCreateData: () => ({}),
    buildStrategyExperimentUpdateData: () => ({}),
    buildStrategyRunData: () => ({}),
    computeDeploymentReadiness: () => ({}),
    activateStrategyVersion: async () => ({}),
    assignStrategyToActiveSet: async () => ({}),
    createStrategyVersion: async () => ({}),
    deactivateStrategyDeployment: async () => {
      deactivateCalled = true;
      return { active: false, experimentId: null };
    },
    getActiveSetState: async () => ({ active: false }),
    getStrategyValidationAggregate: async () => ({}),
    getStrategyLifecycleDashboard: async () => ({}),
    getStrategyLifecycleEvidence: async () => ({}),
    getStrategyExperimentId: () => null,
    getStrategyLeaderboard: async () => ({}),
    getStrategyMemory: async () => ({}),
    getDeploymentAllocationDashboard: async () => ({}),
    computeLifecycleReadiness: () => ({ canActivate: true }),
    removeStrategyFromActiveSet: async () => ({}),
    resolveCanonicalDeploymentState: async () => ({ active: false, deploymentStatus: "INACTIVE" }),
    statusFromReadiness: () => "CANDIDATE",
    persistStrategyRunTrades: async () => ({}),
    persistMarketRegimeSnapshots: async () => ({}),
    prisma: { run: async () => null },
    readActiveStrategyConfig: async () => ({ active: true, experimentId: "exp-1" }),
    resolveBacktestUniversePayload: async (_userId, body) => body,
    runBacktestLabConfigForSymbols: async () => ({}),
    runBacktestParameterSweep: async () => ({}),
    runMonteCarloStress: async () => ({}),
    runParameterSweep: async () => ({}),
    runRegimeAnalysis: async () => ({}),
    runStrategyRobustness: async () => ({}),
    runStrategyPreview: async () => ({}),
    runWalkForward: async () => ({}),
    sanitizeBacktestConfig: () => ({}),
    simulateStrategyPortfolio: async () => ({}),
    strategyStorage: {
      hydrateStrategyExperimentRecord: (value) => value,
    },
    updateDeploymentAllocation: async () => ({}),
    writeActiveStrategyConfig: async () => ({}),
  });

  const res = createResponseRecorder();
  await controller.setActiveStrategy({ user: { id: "user-1" }, body: {} }, res);

  assert.equal(deactivateCalled, true);
  assert.equal(res.body.deployment.deploymentStatus, "INACTIVE");
});

test("controller can roll back by activating a requested historical version", async () => {
  let activatedVersionId = null;
  const versions = [
    { id: "version-4", version: 4 },
    { id: "version-3", version: 3 },
  ];
  const controller = createStrategyLabController({
    buildExperimentBacktestConfig: () => ({}),
    buildStrategyComparisonMetrics: () => ({}),
    buildStrategyComparisonWinner: () => ({}),
    buildStrategyExperimentCreateData: () => ({}),
    buildStrategyExperimentUpdateData: () => ({}),
    buildStrategyRunData: () => ({}),
    computeDeploymentReadiness: () => ({}),
    activateStrategyVersion: async ({ version }) => {
      activatedVersionId = version.id;
      return { active: true, experimentId: "exp-1" };
    },
    assignStrategyToActiveSet: async () => ({}),
    createStrategyVersion: async () => ({}),
    deactivateStrategyDeployment: async () => ({}),
    getActiveSetState: async () => ({ active: true }),
    getStrategyValidationAggregate: async () => ({ hitRate: 70, averageConfidence: 70, byRegime: [] }),
    getStrategyLifecycleDashboard: async () => ({}),
    getStrategyLifecycleEvidence: async () => ({
      latestRun: { tradeCount: 80, sharpe: 1.5, maxDrawdown: -10, expectancy: 1 },
      latestWalkForward: { stabilityScore: 70, summaryJson: { outOfRegimeStability: { pass: true } } },
      latestVersion: versions[0],
      targetVersion: versions[1],
      validation: { hitRate: 70, averageConfidence: 70, byRegime: [] },
      activationRules: {},
    }),
    getStrategyExperimentId: () => null,
    getStrategyLeaderboard: async () => ({}),
    getStrategyMemory: async () => ({}),
    getDeploymentAllocationDashboard: async () => ({}),
    computeLifecycleReadiness: () => ({ canActivate: true, activationRules: {} }),
    removeStrategyFromActiveSet: async () => ({}),
    resolveCanonicalDeploymentState: async () => ({ active: true, deploymentStatus: "ACTIVE" }),
    statusFromReadiness: () => "CANDIDATE",
    persistStrategyRunTrades: async () => ({}),
    persistMarketRegimeSnapshots: async () => ({}),
    prisma: {
      run: async (callback) =>
        callback({
          strategyExperiment: {
            findFirst: async () => ({
              id: "exp-1",
              name: "Momentum Lab",
              description: "",
              settingsJson: { robustness: { score: 80 } },
              versions,
            }),
          },
        }),
    },
    readActiveStrategyConfig: async () => ({ active: false }),
    resolveBacktestUniversePayload: async (_userId, body) => body,
    runBacktestLabConfigForSymbols: async () => ({}),
    runBacktestParameterSweep: async () => ({}),
    runMonteCarloStress: async () => ({}),
    runParameterSweep: async () => ({}),
    runRegimeAnalysis: async () => ({}),
    runStrategyRobustness: async () => ({}),
    runStrategyPreview: async () => ({}),
    runWalkForward: async () => ({}),
    sanitizeBacktestConfig: () => ({}),
    simulateStrategyPortfolio: async () => ({}),
    strategyStorage: {
      hydrateStrategyExperimentRecord: (value) => value,
    },
    updateDeploymentAllocation: async () => ({}),
    writeActiveStrategyConfig: async () => ({}),
  });

  const res = createResponseRecorder();
  await controller.setActiveStrategy({
    user: { id: "user-1" },
    body: { experimentId: "exp-1", strategyVersionId: "version-3" },
  }, res);

  assert.equal(activatedVersionId, "version-3");
});

test("canonical deployment resolution surfaces integrity warnings when state drifts", async () => {
  const deployment = await resolveCanonicalDeploymentState({
    prisma: {
      run: async (callback) =>
        callback({
          strategyDeploymentSet: {
            findUnique: async () => ({
              id: "set-1",
              ownerExperimentId: "exp-live",
              ownerStrategyVersionId: "version-live",
            }),
          },
          strategyVersion: {
            findMany: async () => [
              {
                id: "version-a",
                experimentId: "exp-a",
                version: 1,
                deploymentStatus: "ACTIVE",
                experiment: { id: "exp-a", name: "A", description: "" },
              },
              {
                id: "version-b",
                experimentId: "exp-b",
                version: 2,
                deploymentStatus: "ACTIVE",
                experiment: { id: "exp-b", name: "B", description: "" },
              },
            ],
          },
        }),
    },
    userId: "user-1",
    readActiveStrategyConfig: async () => ({
      active: true,
      experimentId: "exp-stale",
      strategyVersionId: "version-stale",
      name: "Stale",
      description: "",
    }),
  });

  assert.equal(deployment.integrity.activeVersionCount, 2);
  assert.match(
    deployment.integrity.warnings.join(" "),
    /multiple ACTIVE strategy versions detected/i
  );
  assert.match(
    deployment.integrity.warnings.join(" "),
    /cached active strategy metadata diverges/i
  );
});
