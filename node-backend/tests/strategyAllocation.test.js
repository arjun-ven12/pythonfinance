const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAllocationAuditEntries,
  buildAllocationWeights,
  createStrategyAllocationService,
  validateAllocationPlan,
} = require("../features/strategyLab/services/strategyAllocationService");

test("invalid strategy cannot receive allocation", () => {
  const result = validateAllocationPlan({
    strategies: [
      {
        experimentId: "exp-1",
        name: "Fragile Strategy",
        assignedCapitalPct: 25,
        maxAllocationPct: 30,
        hasValidatedEvidence: false,
        walkForwardPassed: false,
        robustnessPassed: false,
        tradeCountPassed: false,
        validationScorePassed: false,
      },
    ],
    matrixCells: [
      {
        key: "Technology::BULL_LOW_VOL",
        sector: "Technology",
        regime: "BULL_LOW_VOL",
        selectedExperimentId: "exp-1",
        allocationPct: 25,
        status: "ACTIVE",
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Strategy not validated/);
});

test("allocations must sum to 100 percent or less", () => {
  const result = validateAllocationPlan({
    strategies: [
      {
        experimentId: "exp-1",
        name: "Momentum Lab",
        assignedCapitalPct: 70,
        maxAllocationPct: 80,
        hasValidatedEvidence: true,
        walkForwardPassed: true,
        robustnessPassed: true,
        tradeCountPassed: true,
        validationScorePassed: true,
      },
      {
        experimentId: "exp-2",
        name: "Defensive Reversion",
        assignedCapitalPct: 40,
        maxAllocationPct: 60,
        hasValidatedEvidence: true,
        walkForwardPassed: true,
        robustnessPassed: true,
        tradeCountPassed: true,
        validationScorePassed: true,
      },
    ],
    matrixCells: [],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sum to 100% or less/i);
});

test("sit-out cells require no strategy", () => {
  const result = validateAllocationPlan({
    strategies: [],
    matrixCells: [
      {
        key: "Utilities::BEAR_HIGH_VOL",
        sector: "Utilities",
        regime: "BEAR_HIGH_VOL",
        selectedExperimentId: "exp-2",
        allocationPct: 12,
        status: "SIT_OUT",
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Sit-out cell/);
});

test("scanner can resolve only one strategy per sector and regime cell", () => {
  const result = validateAllocationPlan({
    strategies: [
      {
        experimentId: "exp-1",
        name: "Momentum Lab",
        assignedCapitalPct: 20,
        maxAllocationPct: 35,
        hasValidatedEvidence: true,
        walkForwardPassed: true,
        robustnessPassed: true,
        tradeCountPassed: true,
        validationScorePassed: true,
      },
      {
        experimentId: "exp-2",
        name: "Defensive Reversion",
        assignedCapitalPct: 20,
        maxAllocationPct: 35,
        hasValidatedEvidence: true,
        walkForwardPassed: true,
        robustnessPassed: true,
        tradeCountPassed: true,
        validationScorePassed: true,
      },
    ],
    matrixCells: [
      {
        key: "Technology::BULL_LOW_VOL",
        sector: "Technology",
        regime: "BULL_LOW_VOL",
        selectedExperimentId: "exp-1",
        allocationPct: 20,
        status: "ACTIVE",
      },
      {
        key: "Technology::BULL_LOW_VOL",
        sector: "Technology",
        regime: "BULL_LOW_VOL",
        selectedExperimentId: "exp-2",
        allocationPct: 20,
        status: "ACTIVE",
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /only one strategy route is allowed/i);
});

test("allocation changes are audited", () => {
  const entries = buildAllocationAuditEntries({
    actorUserId: "user-1",
    deploymentSetId: "set-1",
    previousAllocations: [
      { experimentId: "exp-1", assignedCapitalPct: 20, maxAllocationPct: 30, status: "READY" },
    ],
    nextAllocations: [
      {
        experimentId: "exp-1",
        name: "Momentum Lab",
        assignedCapitalPct: 35,
        maxAllocationPct: 40,
        status: "READY",
      },
    ],
    reasonNote: "Raised weight after validation matured.",
    userId: "user-1",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "ALLOCATION_UPDATED");
  assert.equal(entries[0].previousAllocation.assignedCapitalPct, 20);
  assert.equal(entries[0].newAllocation.assignedCapitalPct, 35);
});

test("risk parity and evidence weighting stay normalized", () => {
  const strategies = [
    { experimentId: "exp-1", expectedDrawdown: -10, evidenceCount: 50, status: "READY" },
    { experimentId: "exp-2", expectedDrawdown: -20, evidenceCount: 100, status: "READY" },
  ];

  const riskParity = buildAllocationWeights(strategies, "RISK_PARITY");
  assert.ok(riskParity["exp-1"] > riskParity["exp-2"]);
  assert.equal(Number((riskParity["exp-1"] + riskParity["exp-2"]).toFixed(6)), 100);

  const evidenceWeighted = buildAllocationWeights(strategies, "EVIDENCE_WEIGHTED");
  assert.ok(evidenceWeighted["exp-2"] > evidenceWeighted["exp-1"]);
  assert.equal(Number((evidenceWeighted["exp-1"] + evidenceWeighted["exp-2"]).toFixed(6)), 100);
});

test("user ownership is enforced when saving allocation routes", async () => {
  const service = createStrategyAllocationService({
    createStrategyVersion: async () => ({ id: "version-owner", version: 2, strategyJson: {} }),
    getStrategyLifecycleDashboard: async () => ({
      strategies: [
        {
          experimentId: "exp-owned",
          envelope: { sectors: ["Technology"], regimes: ["BULL_LOW_VOL"] },
          realizedPerformance: { sampleCount: 50, averageConfidence: 72 },
        },
      ],
    }),
    prisma: {
      run: async (callback) =>
        callback({
          strategyExperiment: {
            findMany: async () => [
              {
                id: "exp-owned",
                name: "Owned Strategy",
                settingsJson: { robustness: { score: 80 } },
                versions: [{ id: "version-owned", version: 1 }],
                runs: [{ returnPct: 12, maxDrawdown: -8, sharpe: 1.4, volatility: 18, tradeCount: 45 }],
                walkForwardRuns: [
                  {
                    stabilityScore: 70,
                    summaryJson: { outOfRegimeStability: { pass: true } },
                  },
                ],
              },
            ],
          },
          strategyDeploymentSet: {
            findUnique: async () => null,
          },
        }),
    },
    readActiveStrategyConfig: async () => ({
      experimentId: null,
      strategyVersionId: null,
      settings: null,
      strategyJson: null,
    }),
    writeActiveStrategyConfig: async () => null,
  });

  await assert.rejects(
    service.updateDeploymentAllocation({
      actorUserId: "user-1",
      userId: "user-1",
      body: {
        allocationMethod: "MANUAL_WEIGHT",
        strategies: [
          {
            experimentId: "exp-owned",
            assignedCapitalPct: 20,
            maxAllocationPct: 30,
          },
        ],
        matrix: {
          cells: [
            {
              key: "Technology::BULL_LOW_VOL",
              sector: "Technology",
              regime: "BULL_LOW_VOL",
              selectedExperimentId: "exp-other-user",
              allocationPct: 20,
              status: "ACTIVE",
            },
          ],
        },
      },
    }),
    /does not belong to this user/i
  );
});

test("stale strategy version references are rejected when saving allocation routes", async () => {
  const service = createStrategyAllocationService({
    createStrategyVersion: async () => ({ id: "version-owner", version: 2, strategyJson: {} }),
    getStrategyLifecycleDashboard: async () => ({
      strategies: [
        {
          experimentId: "exp-owned",
          envelope: { sectors: ["Technology"], regimes: ["BULL_LOW_VOL"] },
          realizedPerformance: { sampleCount: 50, averageConfidence: 72 },
        },
      ],
    }),
    prisma: {
      run: async (callback) =>
        callback({
          strategyExperiment: {
            findMany: async () => [
              {
                id: "exp-owned",
                name: "Owned Strategy",
                status: "ACTIVE",
                settingsJson: { robustness: { score: 80 } },
                versions: [{ id: "version-owned", version: 1 }],
                runs: [{ returnPct: 12, maxDrawdown: -8, sharpe: 1.4, volatility: 18, tradeCount: 45 }],
                walkForwardRuns: [
                  {
                    stabilityScore: 70,
                    summaryJson: { outOfRegimeStability: { pass: true } },
                  },
                ],
              },
            ],
          },
          strategyDeploymentSet: {
            findUnique: async () => null,
          },
        }),
    },
    readActiveStrategyConfig: async () => ({
      experimentId: "exp-owned",
      strategyVersionId: "version-owned",
      settings: { strategyJson: { executable: {} } },
      strategyJson: { executable: {} },
    }),
    writeActiveStrategyConfig: async () => null,
  });

  await assert.rejects(
    service.updateDeploymentAllocation({
      actorUserId: "user-1",
      userId: "user-1",
      body: {
        allocationMethod: "MANUAL_WEIGHT",
        strategies: [
          {
            experimentId: "exp-owned",
            assignedCapitalPct: 20,
            maxAllocationPct: 30,
          },
        ],
        matrix: {
          cells: [
            {
              key: "Technology::BULL_LOW_VOL",
              sector: "Technology",
              regime: "BULL_LOW_VOL",
              selectedExperimentId: "exp-owned",
              selectedStrategyVersionId: "version-stale",
              allocationPct: 20,
              status: "ACTIVE",
            },
          ],
        },
      },
    }),
    /stale or invalid strategy version/i
  );
});

test("allocation updates keep the canonical deployment owner version in sync", async () => {
  let storedActiveConfig = {
    active: true,
    experimentId: "exp-owned",
    strategyVersionId: "version-owned",
    version: 1,
    name: "Owned Strategy",
    description: "",
    settings: { strategyJson: { executable: { allocationMatrix: {} } } },
    strategyJson: { executable: { allocationMatrix: {} } },
  };
  const state = {
    deploymentSet: {
      id: "set-1",
      userId: "user-1",
      allocationMethod: "MANUAL_WEIGHT",
      rebalanceFrequency: "WEEKLY",
      maxDriftPct: 5,
      guardrailsJson: null,
      ownerExperimentId: "exp-owned",
      ownerStrategyVersionId: "version-owned",
      routes: [],
      capitalAllocations: [],
      snapshots: [],
      auditLogs: [],
    },
    experiments: [
      {
        id: "exp-owned",
        name: "Owned Strategy",
        description: "",
        status: "ACTIVE",
        settingsJson: { robustness: { score: 80 }, strategyJson: { executable: { allocationMatrix: {} } } },
        versions: [{ id: "version-owned", version: 1 }],
        runs: [{ returnPct: 12, maxDrawdown: -8, sharpe: 1.4, volatility: 18, tradeCount: 45 }],
        walkForwardRuns: [
          {
            stabilityScore: 70,
            summaryJson: { outOfRegimeStability: { pass: true } },
          },
        ],
      },
    ],
  };
  const nextVersion = {
    id: "version-owner-2",
    version: 2,
    strategyJson: { executable: { allocationMatrix: {} } },
  };

  const service = createStrategyAllocationService({
    createStrategyVersion: async () => nextVersion,
    getStrategyLifecycleDashboard: async () => ({
      strategies: [
        {
          experimentId: "exp-owned",
          envelope: { sectors: ["Technology"], regimes: ["BULL_LOW_VOL"] },
          realizedPerformance: { sampleCount: 50, averageConfidence: 72 },
          latestRun: state.experiments[0].runs[0],
          latestWalkForward: state.experiments[0].walkForwardRuns[0],
        },
      ],
    }),
    prisma: {
      run: async (callback) =>
        callback({
          strategyExperiment: {
            findMany: async () => state.experiments,
            findFirst: async ({ where }) =>
              state.experiments.find((experiment) => experiment.id === where.id) || null,
            updateMany: async ({ where, data }) => {
              state.experiments = state.experiments.map((experiment) =>
                experiment.id === where.id ? { ...experiment, ...data } : experiment
              );
              return { count: 1 };
            },
          },
          strategyDeploymentSet: {
            findUnique: async () => state.deploymentSet,
            upsert: async ({ update, create }) => {
              state.deploymentSet = {
                ...(state.deploymentSet || create),
                ...(state.deploymentSet ? update : create),
                routes: state.deploymentSet?.routes || [],
                capitalAllocations: state.deploymentSet?.capitalAllocations || [],
                snapshots: state.deploymentSet?.snapshots || [],
                auditLogs: state.deploymentSet?.auditLogs || [],
              };
              return state.deploymentSet;
            },
          },
          strategyDeploymentRoute: {
            deleteMany: async () => ({ count: state.deploymentSet.routes.length }),
            createMany: async ({ data }) => {
              state.deploymentSet.routes = data;
              return { count: data.length };
            },
          },
          strategyCapitalAllocation: {
            deleteMany: async () => ({ count: state.deploymentSet.capitalAllocations.length }),
            createMany: async ({ data }) => {
              state.deploymentSet.capitalAllocations = data;
              return { count: data.length };
            },
          },
          strategyAllocationSnapshot: {
            create: async ({ data }) => {
              state.deploymentSet.snapshots.unshift(data);
              return data;
            },
          },
          strategyAllocationAuditLog: {
            createMany: async ({ data }) => {
              state.deploymentSet.auditLogs.unshift(
                ...data.map((entry, index) => ({
                  id: `audit-${index + 1}`,
                  ...entry,
                  actorUser: null,
                  experiment: state.experiments.find((item) => item.id === entry.experimentId) || null,
                  createdAt: new Date().toISOString(),
                }))
              );
              return { count: data.length };
            },
            create: async ({ data }) => {
              state.deploymentSet.auditLogs.unshift({
                id: `audit-sync-${state.deploymentSet.auditLogs.length + 1}`,
                ...data,
                actorUser: null,
                experiment: state.experiments.find((item) => item.id === data.experimentId) || null,
                createdAt: new Date().toISOString(),
              });
              return data;
            },
          },
          strategyVersion: {
            updateMany: async () => ({ count: 1 }),
          },
          $transaction: async (transactionCallback) =>
            transactionCallback({
              strategyExperiment: {
                findFirst: async ({ where }) =>
                  state.experiments.find((experiment) => experiment.id === where.id) || null,
                updateMany: async ({ where, data }) => {
                  state.experiments = state.experiments.map((experiment) =>
                    experiment.id === where.id ? { ...experiment, ...data } : experiment
                  );
                  return { count: 1 };
                },
              },
              strategyDeploymentSet: {
                findUnique: async () => state.deploymentSet,
                upsert: async ({ update }) => {
                  state.deploymentSet = {
                    ...state.deploymentSet,
                    ...update,
                  };
                  return state.deploymentSet;
                },
              },
              strategyDeploymentRoute: {
                deleteMany: async () => ({ count: state.deploymentSet.routes.length }),
                createMany: async ({ data }) => {
                  state.deploymentSet.routes = data;
                  return { count: data.length };
                },
              },
              strategyCapitalAllocation: {
                deleteMany: async () => ({ count: state.deploymentSet.capitalAllocations.length }),
                createMany: async ({ data }) => {
                  state.deploymentSet.capitalAllocations = data;
                  return { count: data.length };
                },
              },
              strategyAllocationSnapshot: {
                create: async ({ data }) => {
                  state.deploymentSet.snapshots.unshift(data);
                  return data;
                },
              },
              strategyAllocationAuditLog: {
                createMany: async ({ data }) => {
                  state.deploymentSet.auditLogs.unshift(
                    ...data.map((entry, index) => ({
                      id: `audit-bulk-${index + 1}`,
                      ...entry,
                      actorUser: null,
                      experiment: state.experiments.find((item) => item.id === entry.experimentId) || null,
                      createdAt: new Date().toISOString(),
                    }))
                  );
                  return { count: data.length };
                },
                create: async ({ data }) => {
                  state.deploymentSet.auditLogs.unshift({
                    id: `audit-single-${state.deploymentSet.auditLogs.length + 1}`,
                    ...data,
                    actorUser: null,
                    experiment: state.experiments.find((item) => item.id === data.experimentId) || null,
                    createdAt: new Date().toISOString(),
                  });
                  return data;
                },
              },
              strategyVersion: {
                updateMany: async () => ({ count: 1 }),
              },
            }),
        }),
    },
    readActiveStrategyConfig: async () => storedActiveConfig,
    strategyStorage: {
      hydrateStrategyExperimentRecord: (value) => value,
      encryptExperimentForStorage: (record) => record,
    },
    writeActiveStrategyConfig: async (_userId, value) => {
      storedActiveConfig = value;
      return value;
    },
  });

  await service.updateDeploymentAllocation({
    actorUserId: "user-1",
    userId: "user-1",
    body: {
      allocationMethod: "MANUAL_WEIGHT",
      strategies: [
        {
          experimentId: "exp-owned",
          assignedCapitalPct: 20,
          maxAllocationPct: 30,
        },
      ],
      matrix: {
        cells: [
          {
            key: "Technology::BULL_LOW_VOL",
            sector: "Technology",
            regime: "BULL_LOW_VOL",
            selectedExperimentId: "exp-owned",
            selectedStrategyVersionId: "version-owned",
            allocationPct: 20,
            status: "ACTIVE",
          },
        ],
      },
    },
  });

  assert.equal(state.deploymentSet.ownerExperimentId, "exp-owned");
  assert.equal(state.deploymentSet.ownerStrategyVersionId, "version-owner-2");
  assert.equal(storedActiveConfig.strategyVersionId, "version-owner-2");
  assert.match(
    JSON.stringify(state.deploymentSet.auditLogs),
    /DEPLOYMENT_ALLOCATION_SYNC/
  );
});
