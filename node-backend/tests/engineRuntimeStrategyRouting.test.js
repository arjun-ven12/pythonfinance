const test = require("node:test");
const assert = require("node:assert/strict");

const createEngineRuntimeService = require("../features/engine/services/engineRuntime.service");

function createService(prismaImpl) {
  return createEngineRuntimeService({
    getDefaultExecutionSettings: () => ({}),
    getDefaultMarketUniverseSettings: () => ({}),
    getExecutionSettingsFromRequest: () => ({}),
    getMarketUniverseSettingsFromRequest: () => ({}),
    getPlaybookSourceData: async () => ({}),
    getPortfolioForUser: async () => ({}),
    getPythonPath: () => "python3",
    getRequestedScanSymbols: () => [],
    getRiskMultiplier: () => 1,
    getScanLimit: () => 50,
    getTradingHorizon: () => "SWING",
    normalizeScanMetadata: (value) => value,
    parseScanArtifacts: () => ({}),
    persistCompletedScan: async () => ({}),
    prisma: prismaImpl,
    pythonEngineDir: "",
    readUserSetting: async () => null,
    scanJobService: {},
    scannerPath: "",
    schedulerControllers: new Map(),
    syncPlaybook: async () => ({}),
    writeUserSetting: async () => ({}),
  });
}

test("scanner strategy config hydrates allocation-matrix strategy routes", async () => {
  const prisma = {
    run: async (callback) =>
      callback({
        strategyVersion: {
          findMany: async () => [
            {
              id: "version-tech",
              version: 4,
              strategyJson: {
                executable: {
                  entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
                },
              },
              settingsJson: {
                emaFast: 12,
                emaSlow: 48,
                rsiThreshold: 52,
                atrStopMultiple: 2.1,
                atrTakeProfitMultiple: 3.4,
                newsWeight: 0.1,
                openaiWeight: 0.05,
                regimeWeight: 0.15,
                riskPerTrade: 0.01,
                signalThreshold: 64,
              },
              experiment: {
                id: "exp-tech",
                name: "Tech Momentum",
                description: "Technology bull trend routing",
                settingsJson: {
                  emaFast: 12,
                  emaSlow: 48,
                },
              },
            },
          ],
        },
        strategyExperiment: {
          findMany: async () => [],
        },
      }),
  };

  const service = createService(prisma);
  const config = await service.buildScannerStrategyConfig(
    {
      active: true,
      experimentId: "base-exp",
      strategyVersionId: "base-version",
      version: 1,
      name: "Base Strategy",
      description: "Base",
      settings: {
        emaFast: 20,
        emaSlow: 50,
        rsiThreshold: 55,
        atrStopMultiple: 2,
        atrTakeProfitMultiple: 3,
        newsWeight: 0.2,
        openaiWeight: 0.1,
        regimeWeight: 0.1,
        riskPerTrade: 0.01,
        signalThreshold: 60,
        strategyJson: {
          executable: {
            allocationMatrix: {
              "Technology::BULL_LOW_VOL": {
                strategyVersionId: "version-tech",
                active: true,
              },
            },
          },
        },
      },
      strategyJson: {
        executable: {
          allocationMatrix: {
            "Technology::BULL_LOW_VOL": {
              strategyVersionId: "version-tech",
              active: true,
            },
          },
        },
      },
    },
    "user-1"
  );

  assert.ok(config.allocation_matrix_strategy_configs);
  const routed =
    config.allocation_matrix_strategy_configs["Technology::BULL_LOW_VOL"];
  assert.ok(routed);
  assert.equal(routed.strategy_version_id, "version-tech");
  assert.equal(routed.experiment_id, "exp-tech");
  assert.equal(routed.strategy_name, "Tech Momentum");
  assert.equal(routed.signal_threshold, 64);
  assert.equal(routed.cell_key, "Technology::BULL_LOW_VOL");
});

test("active strategy settings are not persisted plaintext in user settings", async () => {
  let storedConfig = null;
  const prisma = {
    run: async (callback) =>
      callback({
        strategyVersion: {
          findFirst: async () => ({
            id: "version-1",
            version: 3,
            settingsJson: { riskPerTrade: 0.01, strategyJson: { executable: { entryRules: [] } } },
            strategyJson: {
              executable: {
                entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
              },
            },
          }),
        },
        strategyExperiment: {
          findFirst: async () => ({
            id: "exp-1",
            name: "Momentum Lab",
            description: "Encrypted strategy test",
            settingsJson: { template: "Momentum" },
          }),
        },
      }),
  };

  const service = createEngineRuntimeService({
    getDefaultExecutionSettings: () => ({}),
    getDefaultMarketUniverseSettings: () => ({}),
    getExecutionSettingsFromRequest: () => ({}),
    getMarketUniverseSettingsFromRequest: () => ({}),
    getPlaybookSourceData: async () => ({}),
    getPortfolioForUser: async () => ({}),
    getPythonPath: () => "python3",
    getRequestedScanSymbols: () => [],
    getRiskMultiplier: () => 1,
    getScanLimit: () => 50,
    getTradingHorizon: () => "SWING",
    normalizeScanMetadata: (value) => value,
    parseScanArtifacts: () => ({}),
    persistCompletedScan: async () => ({}),
    prisma,
    pythonEngineDir: "",
    readUserSetting: async () => storedConfig,
    scanJobService: {},
    scannerPath: "",
    schedulerControllers: new Map(),
    syncPlaybook: async () => ({}),
    writeUserSetting: async (_userId, _key, value) => {
      storedConfig = value;
    },
  });

  await service.writeActiveStrategyConfig("user-1", {
    experimentId: "exp-1",
    strategyVersionId: "version-1",
    version: 3,
    name: "Momentum Lab",
    description: "Encrypted strategy test",
    settings: { riskPerTrade: 0.01 },
    strategyJson: {
      executable: {
        entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
      },
    },
  });

  assert.equal(storedConfig.settings, null);
  assert.equal(storedConfig.strategyJson, null);
});

test("active strategy resolution prefers canonical deployment set ownership", async () => {
  let storedConfig = {
    active: true,
    experimentId: "exp-stale",
    strategyVersionId: "version-stale",
    version: 1,
    name: "Stale Strategy",
    description: "stale",
  };

  const service = createEngineRuntimeService({
    getDefaultExecutionSettings: () => ({}),
    getDefaultMarketUniverseSettings: () => ({}),
    getExecutionSettingsFromRequest: () => ({}),
    getMarketUniverseSettingsFromRequest: () => ({}),
    getPlaybookSourceData: async () => ({}),
    getPortfolioForUser: async () => ({}),
    getPythonPath: () => "python3",
    getRequestedScanSymbols: () => [],
    getRiskMultiplier: () => 1,
    getScanLimit: () => 50,
    getTradingHorizon: () => "SWING",
    normalizeScanMetadata: (value) => value,
    parseScanArtifacts: () => ({}),
    persistCompletedScan: async () => ({}),
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
            findFirst: async () => ({
              id: "version-live",
              experimentId: "exp-live",
              version: 7,
              settingsJson: { riskPerTrade: 0.02 },
              strategyJson: { executable: { entryRules: [] } },
              experiment: {
                id: "exp-live",
                name: "Live Strategy",
                description: "live",
              },
            }),
          },
          strategyExperiment: {
            findFirst: async () => ({
              id: "exp-live",
              name: "Live Strategy",
              description: "live",
              settingsJson: { riskPerTrade: 0.02 },
            }),
          },
        }),
    },
    pythonEngineDir: "",
    readUserSetting: async () => storedConfig,
    scanJobService: {},
    scannerPath: "",
    schedulerControllers: new Map(),
    syncPlaybook: async () => ({}),
    writeUserSetting: async (_userId, _key, value) => {
      storedConfig = value;
    },
  });

  const resolved = await service.readActiveStrategyConfig("user-1");

  assert.equal(resolved.experimentId, "exp-live");
  assert.equal(resolved.strategyVersionId, "version-live");
  assert.equal(resolved.version, 7);
  assert.deepEqual(resolved.strategyJson, { executable: { entryRules: [] } });
  assert.equal(resolved.resolution.source, "canonical_deployment");
  assert.match(
    resolved.resolution.warnings.join(" "),
    /stored active_strategy metadata differs/i
  );
});
