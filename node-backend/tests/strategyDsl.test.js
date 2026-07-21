const test = require("node:test");
const assert = require("node:assert/strict");
const { compileStrategySettings } = require("../features/strategyLab/services/strategyCompiler");
const { validateStrategyDsl } = require("../features/strategyLab/services/strategyDslValidator");
const { computeDeploymentReadiness } = require("../features/strategyLab/services/deploymentReadiness");
const createStrategyLabService = require("../features/strategyLab/services/strategyLab.service");

test("builder settings compile into executable nested strategy DSL", () => {
  const { strategyJson, validation } = compileStrategySettings({
    template: "Mean Reversion",
    rsiThreshold: 35,
    riskPerTrade: 0.01,
    signalThreshold: 60,
    rules: [
      { group: "Signal", left: "EMA(20)", comparator: ">", right: "EMA(50)", connector: "AND" },
      { group: "Entry", left: "RSI(14)", comparator: "<", right: "35", connector: "AND" },
    ],
  });

  assert.equal(validation.isValid, true);
  assert.equal(strategyJson.executable.entryRules[0].operator, "AND");
  assert.equal(strategyJson.executable.entryRules[0].children.length, 2);
  assert.deepEqual(strategyJson.executable.entryRules[0].children[0].value, {
    kind: "indicator",
    indicator: "EMA_SLOW",
  });
  assert.equal(strategyJson.executable.positionSizing.method, "risk_per_trade");
  assert.equal(strategyJson.executable.exitRules.length, 4);
});

test("DSL validator rejects unsupported indicators", () => {
  assert.throws(
    () => validateStrategyDsl({
      schemaVersion: "strategy-json/v1",
      executable: {
        entryRules: [{ indicator: "MOON_PHASE", comparator: ">", value: 1 }],
        exitRules: [],
        riskRules: [],
        universe: {},
        timeframe: {},
        positionSizing: {},
        filters: {},
        execution: {},
        validation: {},
        parameters: {},
        weights: {},
        envelope: {},
        regimeOverlays: {},
      },
    }),
    /unsupported/
  );
});

test("DSL validator rejects unsupported rhs indicator references", () => {
  assert.throws(
    () => validateStrategyDsl({
      schemaVersion: "strategy-json/v1",
      executable: {
        entryRules: [
          {
            indicator: "EMA_FAST",
            comparator: ">",
            value: { kind: "indicator", indicator: "MOON_PHASE" },
          },
        ],
        exitRules: [],
        riskRules: [],
        universe: {},
        timeframe: {},
        positionSizing: {},
        filters: {},
        execution: {},
        validation: {},
        parameters: {},
        weights: {},
        envelope: {},
        regimeOverlays: {},
      },
    }),
    /value\.indicator/
  );
});

test("DSL validator rejects missing required executable fields", () => {
  assert.throws(
    () => validateStrategyDsl({
      schemaVersion: "strategy-json/v1",
      executable: {
        entryRules: [{ indicator: "RSI", comparator: "<", value: 35 }],
      },
    }),
    /strategyJson\.executable\./
  );
});

test("backtest config recompiles partial saved strategyJson before Python execution", () => {
  const service = createStrategyLabService({
    appendOutput: (output, chunk) => `${output}${chunk}`,
    getBacktestSymbols: ({ symbol }) => [symbol],
    getProcessFailureMessage: (prefix, stderr) => `${prefix}: ${stderr}`,
    getPythonPath: () => "python",
    parseJsonOutput: JSON.parse,
    prisma: {},
    pythonEngineDir: "",
    spawn: () => {},
    strategyStorage: {},
    validateSymbol: () => true,
  });

  const config = service.buildExperimentBacktestConfig({
    id: "experiment-1",
    name: "Legacy Partial Strategy",
    description: "Saved before the full execution contract was required.",
    settingsJson: {
      riskPerTrade: 0.01,
      strategyJson: {
        schemaVersion: "strategy-json/v1",
        executable: {
          entryRules: [{ indicator: "RSI", comparator: "<", value: 35 }],
        },
      },
    },
  });

  assert.equal(config.strategyConfig.strategyJson.schemaVersion, "strategy-json/v1");
  assert.equal(config.strategyConfig.strategyJson.executable.universe.type, "SINGLE");
  assert.equal(config.strategyConfig.strategyJson.executable.timeframe.primary, "1D");
  assert.doesNotThrow(() => validateStrategyDsl(config.strategyConfig.strategyJson));
});

test("strategy lab service exposes builder settings compiler for copilot workflows", () => {
  const service = createStrategyLabService({
    appendOutput: (output, chunk) => `${output}${chunk}`,
    getBacktestSymbols: ({ symbol }) => [symbol],
    getProcessFailureMessage: (prefix, stderr) => `${prefix}: ${stderr}`,
    getPythonPath: () => "python",
    parseJsonOutput: JSON.parse,
    prisma: {},
    pythonEngineDir: "",
    spawn: () => {},
    strategyStorage: {},
    validateSymbol: () => true,
  });

  assert.equal(typeof service.buildStrategyExperimentSettings, "function");
});

test("deployment readiness blocks weak strategies", () => {
  const readiness = computeDeploymentReadiness({
    latestRun: {
      tradeCount: 4,
      sharpe: 0.2,
      maxDrawdown: -35,
      expectancy: -1,
    },
    robustness: { score: 30 },
  });

  assert.equal(readiness.canActivate, false);
  assert.match(readiness.label, /Experimental|Research/);
  assert.ok(readiness.reasons.length > 0);
});

test("deployment readiness blocks headline performance without validation evidence", () => {
  const readiness = computeDeploymentReadiness({
    latestRun: {
      tradeCount: 80,
      sharpe: 2.4,
      maxDrawdown: -8,
      expectancy: 4,
    },
    robustness: { score: 82 },
    walkForward: { stabilityScore: 12 },
    validation: { hitRate: 20 },
    activationRules: {
      minimumTrades: 30,
      minimumRobustness: 60,
      minimumWalkForwardStability: 55,
      validationConfidenceThreshold: 55,
    },
  });

  assert.equal(readiness.canActivate, false);
  assert.match(readiness.reasons.join(" "), /Walk-forward|Validation/);
});
