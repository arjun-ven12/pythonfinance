const { compileStrategySettings } = require("./strategyCompiler");
const { validateStrategyDsl } = require("./strategyDslValidator");
const { computeDeploymentReadiness } = require("./deploymentReadiness");
const { runStrategyRobustness } = require("./strategyRobustnessService");
const { createWalkForwardService } = require("./walkForwardService");
const { createRegimeAnalysisService } = require("./regimeAnalysisService");
const { createMonteCarloService } = require("./monteCarloService");
const { createStrategyLeaderboardService } = require("./strategyLeaderboardService");
const { createStrategyMemoryService } = require("./strategyMemoryService");
const { createPortfolioSimulationService } = require("./portfolioSimulationService");
const { createMatrixReplayService } = require("./matrixReplayService");
const {
  getDefaultStrategyStorageService,
} = require("./strategyStorage.service");
const { buildRegimeBreakdown } = require("./strategyConditioningService");

function createStrategyLabService({
  appendOutput,
  getBacktestSymbols,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  spawn,
  strategyStorage = getDefaultStrategyStorageService(),
  validateSymbol,
}) {
  function toNullableNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

const strategyExperimentSettingFields = [
  {
    key: "emaFast",
    aliases: ["emaFast", "ema_fast"],
    label: "EMA Fast",
    min: 1,
    integer: true,
  },
  {
    key: "emaSlow",
    aliases: ["emaSlow", "ema_slow"],
    label: "EMA Slow",
    min: 1,
    integer: true,
  },
  {
    key: "rsiThreshold",
    aliases: ["rsiThreshold", "rsi_threshold"],
    label: "RSI Threshold",
    min: 0,
    max: 100,
  },
  {
    key: "atrStopMultiple",
    aliases: ["atrStopMultiple", "atr_stop_multiple"],
    label: "ATR Stop Multiple",
    min: 0,
  },
  {
    key: "atrTakeProfitMultiple",
    aliases: ["atrTakeProfitMultiple", "atr_take_profit_multiple"],
    label: "ATR Take Profit Multiple",
    min: 0,
  },
  {
    key: "newsWeight",
    aliases: ["newsWeight", "news_weight"],
    label: "News Weight",
    min: 0,
  },
  {
    key: "openaiWeight",
    aliases: ["openaiWeight", "openai_weight"],
    label: "OpenAI Weight",
    min: 0,
  },
  {
    key: "regimeWeight",
    aliases: ["regimeWeight", "regime_weight"],
    label: "Regime Weight",
    min: 0,
  },
  {
    key: "riskPerTrade",
    aliases: ["riskPerTrade", "risk_per_trade"],
    label: "Risk Per Trade",
    min: 0,
  },
  {
    key: "signalThreshold",
    aliases: ["signalThreshold", "signal_threshold"],
    label: "Signal Threshold",
    min: 0,
    max: 100,
  },
];

function getAliasedValue(source, field) {
  for (const alias of field.aliases) {
    if (source?.[alias] !== undefined) {
      return source[alias];
    }
  }

  return undefined;
}

function parseStrategySettingValue(value, field) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${field.label} must be a number.`);
  }

  if (field.min !== undefined && parsed < field.min) {
    throw new Error(`${field.label} must be at least ${field.min}.`);
  }

  if (field.max !== undefined && parsed > field.max) {
    throw new Error(`${field.label} must be at most ${field.max}.`);
  }

  return field.integer ? Math.round(parsed) : parsed;
}

function normalizeExperimentStatus(value, fallback = "DRAFT") {
  const status = String(value || fallback).trim().toUpperCase();
  const allowedStatuses = new Set([
    "DRAFT",
    "RESEARCH",
    "CANDIDATE",
    "ACTIVE",
    "ARCHIVED",
    "TESTED",
    "PAUSED",
  ]);
  return allowedStatuses.has(status) ? status : fallback;
}

function normalizeDeploymentStatus(value, fallback = "DRAFT") {
  const status = String(value || fallback).trim().toUpperCase();
  if (status === "TESTED") return "RESEARCH";
  if (status === "PAUSED") return "CANDIDATE";
  const allowedStatuses = new Set([
    "DRAFT",
    "RESEARCH",
    "CANDIDATE",
    "ACTIVE",
    "ARCHIVED",
  ]);
  return allowedStatuses.has(status) ? status : fallback;
}

function buildStrategyExperimentSettings(body = {}, existingSettings = {}, partial = false) {
  const source = body.settingsJson || body.settings || body;
  const settings = {
    ...existingSettings,
    ...source,
  };

  for (const field of strategyExperimentSettingFields) {
    const value = getAliasedValue(source, field);

    if (value === undefined) {
      if (!partial && settings[field.key] === undefined) {
        throw new Error(`${field.label} is required.`);
      }

      continue;
    }

    settings[field.key] = parseStrategySettingValue(value, field);
  }

  if (source.universeId !== undefined) {
    settings.universeId = source.universeId ? String(source.universeId) : "";
  }

  if (source.universeName !== undefined) {
    settings.universeName = source.universeName ? String(source.universeName) : "";
  }

  const { strategyJson, validation } = compileStrategySettings(settings, {
    description: body.description,
  });
  settings.strategyJson = strategyJson;
  settings.dslValidation = validation;

  return settings;
}

async function createStrategyVersion(db, userId, experiment, changeNote = "Saved strategy", options = {}) {
  const hydratedExperiment = strategyStorage.hydrateStrategyExperimentRecord(experiment);
  const settings = hydratedExperiment.settingsJson || {};
  const { strategyJson, validation } = compileStrategySettings(settings, {
    description: hydratedExperiment.description,
  });
  const latest = await db.strategyVersion.findFirst({
    where: { experimentId: hydratedExperiment.id, userId },
    orderBy: { version: "desc" },
  });
  const desiredDeploymentStatus =
    options.deploymentStatus ||
    (String(hydratedExperiment.status || "").toUpperCase() === "ACTIVE"
      ? "CANDIDATE"
      : normalizeDeploymentStatus(hydratedExperiment.status, "DRAFT"));
  const encryptedVersion = strategyStorage.encryptVersionForStorage({
    id: undefined,
    userId,
    experimentId: hydratedExperiment.id,
    version: (latest?.version || 0) + 1,
    deploymentStatus: desiredDeploymentStatus,
    strategyJson,
    settingsJson: settings,
  });
  const createdVersion = await db.strategyVersion.create({
    data: {
      userId,
      experimentId: hydratedExperiment.id,
      version: (latest?.version || 0) + 1,
      deploymentStatus: desiredDeploymentStatus,
      strategyJson: encryptedVersion.strategyJson,
      settingsJson: encryptedVersion.settingsJson,
      encryptedStrategy: encryptedVersion.encryptedStrategy,
      encryptedStrategyKey: encryptedVersion.encryptedStrategyKey,
      strategyEncryptionIv: encryptedVersion.strategyEncryptionIv,
      strategyEncryptionTag: encryptedVersion.strategyEncryptionTag,
      strategyEncryptionKeyIv: encryptedVersion.strategyEncryptionKeyIv,
      strategyEncryptionKeyTag: encryptedVersion.strategyEncryptionKeyTag,
      strategyEncryptionAlgorithmVersion: encryptedVersion.strategyEncryptionAlgorithmVersion,
      evidenceJson: {
        dslValidation: validation,
        deploymentReadiness: settings.deploymentReadiness || null,
        robustness: settings.robustness || null,
        ...(options.evidenceJson || {}),
      },
      changeNote,
    },
  });
  return strategyStorage.hydrateStrategyVersionRecord(createdVersion);
}

function buildStrategyExperimentCreateData(body = {}) {
  const name = String(body.name || "").trim();

  if (!name) {
    throw new Error("Experiment name is required.");
  }

  return {
    name,
    description: String(body.description || "").trim() || null,
    status: normalizeExperimentStatus(body.status),
    settingsJson: buildStrategyExperimentSettings(body),
  };
}

function buildStrategyExperimentUpdateData(body = {}, existingExperiment) {
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();

    if (!name) {
      throw new Error("Experiment name cannot be empty.");
    }

    data.name = name;
  }

  if (body.description !== undefined) {
    data.description = String(body.description || "").trim() || null;
  }

  if (body.status !== undefined) {
    data.status = normalizeExperimentStatus(body.status, existingExperiment.status);
  }

  if (body.settings !== undefined || body.settingsJson !== undefined) {
    data.settingsJson = buildStrategyExperimentSettings(
      body,
      existingExperiment.settingsJson || {},
      true
    );
  }

  return data;
}

function sanitizeBacktestConfig(config = {}) {
  const symbols = getBacktestSymbols(config);
  const period = String(config.period || "2y");
  const startDate = normalizeOptionalDate(config.startDate || config.start_date);
  const endDate = normalizeOptionalDate(config.endDate || config.end_date);
  const riskPerTrade = Number.parseFloat(config.riskPerTrade);
  const emaFast = Number.parseInt(config.emaFast, 10);
  const emaSlow = Number.parseInt(config.emaSlow, 10);
  const rsiThreshold = Number.parseFloat(config.rsiThreshold);

  if (!/^\d+(d|mo|y)$/.test(period)) {
    throw new Error("Time horizon must use formats like 6mo, 1y, 2y, or 5y.");
  }

  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 1) {
    throw new Error("Risk per trade must be between 0 and 1.");
  }

  validateDateRange(startDate, endDate);

  return {
    symbol: symbols[0],
    symbols,
    universeMode: config.universeMode || null,
    universeId: config.universeId || null,
    topN: config.topN || config.limit || null,
    period,
    startDate,
    endDate,
    benchmark: validateSymbol(config.benchmark || "SPY"),
    riskPerTrade,
    emaFast: Number.isFinite(emaFast) ? emaFast : 20,
    emaSlow: Number.isFinite(emaSlow) ? emaSlow : 50,
    rsiThreshold: Number.isFinite(rsiThreshold) ? rsiThreshold : 55,
    trailingStopEnabled: config.trailingStopEnabled !== false,
    regimeFilterEnabled: Boolean(config.regimeFilterEnabled),
    newsFilterEnabled: Boolean(config.newsFilterEnabled),
    strategy: String(config.strategy || "Default Strategy"),
  };
}

function runBacktestLabConfig(config) {
  return new Promise((resolve, reject) => {
    const script = [
      "import json, sys",
      "from backtest import run_backtest, run_multi_asset_backtest",
      "config = json.loads(sys.argv[1])",
      "horizon_profile = config.get('horizonProfile')",
      "strategy_config = config.get('strategyConfig')",
      "symbols = config.get('symbols') or [config['symbol']]",
      "if len(symbols) > 1:",
      "    result = run_multi_asset_backtest(",
      "        symbols=symbols,",
      "        initial_cash=float(config.get('initialCash', 1000)),",
      "        period=config['period'],",
      "        risk_per_trade=config['riskPerTrade'],",
      "        horizon_profile=horizon_profile,",
      "        strategy_config=strategy_config,",
      "        start_date=config.get('startDate'),",
      "        end_date=config.get('endDate'),",
      "        benchmark_symbol=config.get('benchmark', 'SPY'),",
      "    )",
      "else:",
      "    result = run_backtest(",
      "        symbol=config['symbol'],",
      "        initial_cash=float(config.get('initialCash', 1000)),",
      "        period=config['period'],",
      "        risk_per_trade=config['riskPerTrade'],",
      "        horizon_profile=horizon_profile,",
      "        strategy_config=strategy_config,",
      "        start_date=config.get('startDate'),",
      "        end_date=config.get('endDate'),",
      "        benchmark_symbol=config.get('benchmark', 'SPY'),",
      "    )",
      "print(json.dumps({'config': config, 'result': result}))",
    ].join("\n");
    const child = spawn(getPythonPath(), ["-c", script, JSON.stringify(config)], {
      cwd: pythonEngineDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(getProcessFailureMessage("Backtest failed", stderr));
        error.details = { code, stdout, stderr };
        reject(error);
        return;
      }

      try {
        resolve(parseJsonOutput(stdout));
      } catch (error) {
        error.details = { stdout, stderr };
        reject(error);
      }
    });
  });
}

function averageMetric(results, key) {
  const values = results
    .map((item) => Number(item?.result?.[key]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumMetric(results, key) {
  return results
    .map((item) => Number(item?.result?.[key]))
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
}

function averageCurve(results, curveKey, valueKey, outputKey = valueKey) {
  const curves = results
    .map((item) => item?.result?.[curveKey] || [])
    .filter((curve) => curve.length > 0);

  if (curves.length === 0) {
    return [];
  }

  const minLength = Math.min(...curves.map((curve) => curve.length));

  return Array.from({ length: minLength }, (_item, index) => {
    const points = curves.map((curve) => curve[index]);
    const values = points
      .map((point) => Number(point?.[valueKey]))
      .filter((value) => Number.isFinite(value));
    const average =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

    return {
      date: points[0]?.date || String(index + 1),
      [outputKey]: Number(average.toFixed(2)),
    };
  });
}

function validateBacktestResult(result = {}) {
  const warnings = [];
  const tradeCount = Number(result.completed_trades);
  const completedTradeLog = result.completed_trade_log || [];

  if (Number.isFinite(tradeCount) && tradeCount > 0 && completedTradeLog.length === 0) {
    warnings.push("trade count exists but trade log is empty");
  }

  if (result.buy_and_hold_return_pct === null || result.buy_and_hold_return_pct === undefined) {
    warnings.push("buy and hold return missing");
  }

  if (result.benchmark_return_pct === null || result.benchmark_return_pct === undefined) {
    warnings.push("benchmark return missing");
  }

  if (
    !Object.prototype.hasOwnProperty.call(result, "profit_factor") ||
    !Object.prototype.hasOwnProperty.call(result, "average_winner") ||
    !Object.prototype.hasOwnProperty.call(result, "average_loser") ||
    !Object.prototype.hasOwnProperty.call(result, "largest_winner") ||
    !Object.prototype.hasOwnProperty.call(result, "largest_loser") ||
    !Object.prototype.hasOwnProperty.call(result, "average_holding_period_days")
  ) {
    warnings.push("pnl breakdown missing");
  }

  return {
    is_valid: warnings.length === 0,
    warnings,
  };
}

function buildBacktestFilterAudit(config) {
  const strategyJson = config.strategyConfig?.strategyJson || config.strategyConfig?.strategy_json || {};
  const regimeOverlays = strategyJson?.executable?.regimeOverlays || {};
  return {
    generated_at: new Date().toISOString(),
    strategy: config.strategy || "Default Strategy",
    symbol_scope: config.symbols || [config.symbol],
    regime_filter: {
      enabled: Boolean(config.regimeFilterEnabled),
      applied_to_signal_generation: Boolean(config.regimeFilterEnabled),
      applied_to_position_sizing: Object.keys(regimeOverlays).length > 0,
      applied_to_exits: Object.keys(regimeOverlays).length > 0,
      effect_on_results:
        Boolean(config.regimeFilterEnabled) || Object.keys(regimeOverlays).length > 0
          ? "REGIME_CONDITIONED"
          : "NONE_CURRENTLY",
      explanation: Boolean(config.regimeFilterEnabled) || Object.keys(regimeOverlays).length > 0
        ? "Backtests classify regime per bar and apply any matching regime overlay parameters from strategyJson. Per-regime evidence is persisted in the run summary."
        : "Regime filter is disabled for this run.",
    },
    news_filter: {
      enabled: Boolean(config.newsFilterEnabled),
      applied_to_signal_generation: false,
      applied_to_confidence: false,
      applied_to_trade_blocking: false,
      effect_on_results: "NONE_CURRENTLY",
      explanation: Boolean(config.newsFilterEnabled)
        ? "News filter is enabled in the Backtesting UI, but historical news/event data is not currently replayed inside run_backtest. Results do not include news-based trade blocking or confidence adjustment."
        : "News filter is disabled for this run.",
    },
    active_inputs: {
      ema_fast: config.emaFast,
      ema_slow: config.emaSlow,
      rsi_threshold: config.rsiThreshold,
      risk_per_trade: config.riskPerTrade,
      trailing_stop_enabled: config.trailingStopEnabled,
      start_date: config.startDate,
      end_date: config.endDate,
      period: config.period,
    },
    conclusion:
      Boolean(config.regimeFilterEnabled)
        ? "Regime overlays can affect signal generation and trade management during replay. News toggles remain informational until historical news replay is added."
        : "News toggles remain informational until historical news replay is added.",
  };
}

function buildAggregateBacktestOutput(baseConfig, symbolOutputs) {
  const successfulOutputs = symbolOutputs.filter((output) => output.result);

  if (successfulOutputs.length === 0) {
    throw new Error("No symbols produced a successful backtest.");
  }

  const symbolResults = successfulOutputs.map((output) => ({
    symbol: output.result.symbol || output.config.symbol,
    config: output.config,
    result: output.result,
  }));
  const firstResult = successfulOutputs[0].result;
  const aggregateResult = {
    ...firstResult,
    symbol: baseConfig.symbols.join(","),
    symbols: baseConfig.symbols,
    is_multi_symbol: baseConfig.symbols.length > 1,
    total_return_pct: averageMetric(successfulOutputs, "total_return_pct"),
    annualized_return_pct: averageMetric(successfulOutputs, "annualized_return_pct"),
    sharpe_ratio: averageMetric(successfulOutputs, "sharpe_ratio"),
    max_drawdown_pct: averageMetric(successfulOutputs, "max_drawdown_pct"),
    win_rate_pct: averageMetric(successfulOutputs, "win_rate_pct"),
    expectancy_per_trade: averageMetric(successfulOutputs, "expectancy_per_trade"),
    volatility_pct: averageMetric(successfulOutputs, "volatility_pct"),
    buy_and_hold_return_pct: averageMetric(successfulOutputs, "buy_and_hold_return_pct"),
    benchmark_return_pct: averageMetric(successfulOutputs, "benchmark_return_pct"),
    profit_factor: averageMetric(successfulOutputs, "profit_factor"),
    average_winner: averageMetric(successfulOutputs, "average_winner"),
    average_loser: averageMetric(successfulOutputs, "average_loser"),
    largest_winner: averageMetric(successfulOutputs, "largest_winner"),
    largest_loser: averageMetric(successfulOutputs, "largest_loser"),
    average_holding_period_days: averageMetric(successfulOutputs, "average_holding_period_days"),
    completed_trades: sumMetric(successfulOutputs, "completed_trades"),
    final_value: averageMetric(successfulOutputs, "final_value"),
    total_profit: averageMetric(successfulOutputs, "total_profit"),
    trades: symbolResults.flatMap((item) =>
      (item.result.trades || []).map((trade) => ({
        ...trade,
        symbol: item.symbol,
      }))
    ),
    completed_trade_log: symbolResults.flatMap((item) =>
      (item.result.completed_trade_log || []).map((trade) => ({
        ...trade,
        symbol: item.symbol,
      }))
    ),
    equity_curve: averageCurve(successfulOutputs, "equity_curve", "equity"),
    drawdown_curve: averageCurve(successfulOutputs, "drawdown_curve", "drawdown"),
    benchmark_curve: averageCurve(successfulOutputs, "benchmark_curve", "benchmark"),
    symbol_results: symbolResults,
    filter_audit: buildBacktestFilterAudit(baseConfig),
  };
  aggregateResult.validation = validateBacktestResult(aggregateResult);

  return {
    config: {
      ...baseConfig,
      symbol: baseConfig.symbols[0],
      filter_audit: buildBacktestFilterAudit(baseConfig),
    },
    result: aggregateResult,
    symbol_results: symbolResults,
  };
}

async function runBacktestLabConfigForSymbols(config) {
  const symbols = config.symbols?.length ? config.symbols : [config.symbol];
  if (symbols.length > 1) {
    return runBacktestLabConfig({
      ...config,
      symbol: symbols[0],
      symbols,
      initialCash: Number(config.initialCash || config.initial_cash || 1000),
    });
  }

  return runBacktestLabConfig({
    ...config,
    symbol: symbols[0],
    symbols,
    initialCash: Number(config.initialCash || config.initial_cash || 1000),
  });
}

const BACKTEST_SWEEP_PARAMETERS = new Set([
  "emaFast",
  "emaSlow",
  "rsiThreshold",
  "atrStopMultiple",
  "atrTakeProfitMultiple",
  "trailingStopAtrMultiple",
]);

const BACKTEST_SWEEP_METRICS = new Set([
  "returnPct",
  "cagr",
  "sharpe",
  "maxDrawdown",
  "winRate",
  "expectancy",
]);

function parseSweepValues(parameter, fallbackValues = []) {
  const values = Array.isArray(parameter?.values) ? parameter.values : fallbackValues;
  const parsedValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return [...new Set(parsedValues)];
}

function validateSweepParameter(parameter, axisName) {
  const name = String(parameter?.name || "").trim();

  if (!BACKTEST_SWEEP_PARAMETERS.has(name)) {
    throw new Error(`${axisName} parameter is not supported.`);
  }

  const values = parseSweepValues(parameter);

  if (values.length === 0) {
    throw new Error(`${axisName} parameter needs at least one numeric value.`);
  }

  if (values.length > 12) {
    throw new Error(`${axisName} parameter supports up to 12 values.`);
  }

  return {
    name,
    values,
  };
}

function normalizeSweepMetric(value) {
  const metric = String(value || "sharpe").trim();
  return BACKTEST_SWEEP_METRICS.has(metric) ? metric : "sharpe";
}

function normalizeSweepFixedSettings(settings = {}) {
  return {
    emaFast: Number(settings.emaFast || 20),
    emaSlow: Number(settings.emaSlow || 50),
    rsiThreshold: Number(settings.rsiThreshold || 65),
    atrStopMultiple: Number(settings.atrStopMultiple || 1.5),
    atrTakeProfitMultiple: Number(settings.atrTakeProfitMultiple || 8),
    trailingStopAtrMultiple: Number(settings.trailingStopAtrMultiple || 2),
  };
}

function buildBacktestConfigFromSweep(baseConfig, settings) {
  return {
    ...baseConfig,
    emaFast: settings.emaFast,
    emaSlow: settings.emaSlow,
    rsiThreshold: settings.rsiThreshold,
    horizonProfile: {
      indicator_configuration: {
        ema_fast: settings.emaFast,
        ema_slow: settings.emaSlow,
      },
      stop_loss_atr_multiple: settings.atrStopMultiple,
      take_profit_atr_multiple: settings.atrTakeProfitMultiple,
      trailing_stop_atr_multiple: settings.trailingStopAtrMultiple,
    },
    strategyConfig: {
      rsi_threshold: settings.rsiThreshold,
    },
  };
}

function mapBacktestResultToSweepCell({ xValue, yValue, settings, backtestOutput }) {
  const result = backtestOutput.result || {};
  const tradeCount = Number(result.completed_trades || 0);

  return {
    xValue,
    yValue,
    settings,
    returnPct: Number(result.total_return_pct || 0),
    cagr: Number(result.annualized_return_pct || 0),
    sharpe: Number(result.sharpe_ratio || 0),
    maxDrawdown: Number(result.max_drawdown_pct || 0),
    winRate: Number(result.win_rate_pct || 0),
    expectancy: Number(result.expectancy_per_trade || 0),
    tradeCount,
    profitFactor: Number(result.profit_factor || 0),
    buyAndHoldReturn: Number(result.buy_and_hold_return_pct || 0),
    overfittingWarning:
      tradeCount < 5
        ? "LOW_TRADE_COUNT"
        : Number(result.max_drawdown_pct || 0) > 35
          ? "HIGH_DRAWDOWN"
          : null,
  };
}

function getSweepMetricValue(result, metric) {
  return Number(result?.[metric] || 0);
}

function isHigherSweepMetricBetter(metric) {
  return metric !== "maxDrawdown";
}

async function runBacktestParameterSweep(body = {}) {
  const metricToOptimize = normalizeSweepMetric(body.metricToOptimize);
  const xParameter = validateSweepParameter(body.xParameter, "X-axis");
  const yParameter = validateSweepParameter(body.yParameter, "Y-axis");
  const combinationCount = xParameter.values.length * yParameter.values.length;

  if (combinationCount > 120) {
    throw new Error("Parameter sweep supports up to 120 combinations per run.");
  }

  const baseConfig = sanitizeBacktestConfig({
    symbol: body.symbol || "AAPL",
    period: body.period || "2y",
    riskPerTrade: body.riskPerTrade || 0.01,
    ...(body.fixedSettings || {}),
  });
  const fixedSettings = normalizeSweepFixedSettings({
    emaFast: baseConfig.emaFast,
    emaSlow: baseConfig.emaSlow,
    rsiThreshold: baseConfig.rsiThreshold,
    ...(body.fixedSettings || {}),
  });
  const results = [];
  const warnings = [];

  for (const yValue of yParameter.values) {
    for (const xValue of xParameter.values) {
      const settings = {
        ...fixedSettings,
        [xParameter.name]: xValue,
        [yParameter.name]: yValue,
      };
      const backtestConfig = buildBacktestConfigFromSweep(baseConfig, settings);
      const backtestOutput = await runBacktestLabConfig(backtestConfig);
      const cell = mapBacktestResultToSweepCell({
        xValue,
        yValue,
        settings,
        backtestOutput,
      });

      if (cell.overfittingWarning) {
        warnings.push({
          type: cell.overfittingWarning,
          xValue,
          yValue,
          message:
            cell.overfittingWarning === "LOW_TRADE_COUNT"
              ? `Only ${cell.tradeCount} completed trades for ${xParameter.name}=${xValue}, ${yParameter.name}=${yValue}.`
              : `Drawdown is ${cell.maxDrawdown.toFixed(2)}% for ${xParameter.name}=${xValue}, ${yParameter.name}=${yValue}.`,
        });
      }

      results.push(cell);
    }
  }

  const higherIsBetter = isHigherSweepMetricBetter(metricToOptimize);
  const sorted = [...results].sort((a, b) => {
    const diff = getSweepMetricValue(b, metricToOptimize) - getSweepMetricValue(a, metricToOptimize);
    return higherIsBetter ? diff : -diff;
  });
  const averageMetric =
    results.length > 0
      ? results.reduce((sum, result) => sum + getSweepMetricValue(result, metricToOptimize), 0) /
        results.length
      : 0;

  return {
    generated_at: new Date().toISOString(),
    config: {
      symbol: baseConfig.symbol,
      period: baseConfig.period,
      riskPerTrade: baseConfig.riskPerTrade,
      metricToOptimize,
      xParameter,
      yParameter,
      fixedSettings,
    },
    results,
    bestResult: sorted[0] || null,
    topResults: sorted.slice(0, 5),
    worstResults: sorted.slice(-5).reverse(),
    averageMetric: Number(averageMetric.toFixed(4)),
    sampleCount: results.length,
    warnings,
  };
}

function summarizePreviewResult(backtestOutput) {
  const result = backtestOutput.result || {};
  const trades = Array.isArray(result.completed_trade_log)
    ? result.completed_trade_log
    : [];
  const equity = Array.isArray(result.equity_curve) ? result.equity_curve : [];
  const firstEquity = Number(equity[0]?.equity);
  const lastEquity = Number(equity[equity.length - 1]?.equity);
  const exposureProxy =
    Number.isFinite(firstEquity) && Number.isFinite(lastEquity)
      ? Math.abs(lastEquity - firstEquity)
      : null;

  return {
    symbol: result.symbol || backtestOutput.config?.symbol || null,
    signalCount: (result.trades || []).filter((trade) => trade.type === "BUY").length,
    tradeCount: Number(result.completed_trades || 0),
    averageHoldingPeriodDays: result.average_holding_period_days ?? null,
    hitRate: result.win_rate_pct ?? null,
    returnPct: result.total_return_pct ?? null,
    drawdownPct: result.max_drawdown_pct ?? null,
    exposureProxy,
    equityCurve: equity.slice(-40),
    latestTradeTrace: trades[trades.length - 1]?.decision_snapshot || null,
    benchmarkUnavailable: Boolean(result.benchmarkUnavailable || result.benchmark_unavailable),
  };
}

async function runStrategyPreview(body = {}) {
  const settings = buildStrategyExperimentSettings({
    name: body.name || "Preview strategy",
    description: body.description || "",
    status: "DRAFT",
    settings: body.settings || {},
  });
  const experiment = {
    id: "preview",
    name: body.name || "Preview strategy",
    description: body.description || "",
    settingsJson: settings,
  };
  const config = buildExperimentBacktestConfig(experiment, {
    symbol: body.symbol || "AAPL",
    symbols: body.symbol || "AAPL",
    period: body.period || "6mo",
    benchmark: body.benchmark || "SPY",
    riskPerTrade: settings.riskPerTrade || 0.01,
  });
  const output = await runBacktestLabConfigForSymbols({
    ...config,
    symbols: config.symbols.slice(0, 1),
    period: "6mo",
  });

  return {
    generatedAt: new Date().toISOString(),
    previewOnly: true,
    label: "Preview — bounded sample, not a validated result.",
    config: {
      symbol: output.config?.symbol || config.symbol,
      period: output.config?.period || "6mo",
      strategy: experiment.name,
    },
    metrics: summarizePreviewResult(output),
  };
}

function normalizeBacktestPeriod(value, fallback = "2y") {
  const period = String(value || fallback);

  if (!/^\d+(d|mo|y)$/.test(period)) {
    throw new Error("Period must use formats like 6mo, 1y, 2y, or 5y.");
  }

  return period;
}

function normalizeOptionalDate(value) {
  const date = String(value || "").trim();

  if (!date) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
    throw new Error("Custom backtest dates must use YYYY-MM-DD.");
  }

  return date;
}

function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return;
  }

  if (new Date(startDate).getTime() >= new Date(endDate).getTime()) {
    throw new Error("Backtest start date must be before end date.");
  }
}

function resolveExecutableStrategyJson(settings = {}, experiment = {}) {
  if (settings.strategyJson) {
    try {
      validateStrategyDsl(settings.strategyJson);
      return settings.strategyJson;
    } catch (_error) {
      // Older saved experiments may contain a partial executable object. Recompile
      // from the builder settings so Python receives the full canonical contract.
    }
  }

  return compileStrategySettings(settings, {
    description: experiment.description,
  }).strategyJson;
}

function buildExperimentBacktestConfig(experiment, body = {}) {
  const settings = experiment.settingsJson || {};
  const strategyJson = resolveExecutableStrategyJson(settings, experiment);
  const symbols = getBacktestSymbols({
    symbols: body.symbols || body.symbolList || settings.symbols,
    symbol: body.symbol || settings.symbol || "AAPL",
  });
  const riskPerTrade = Number.parseFloat(
    body.riskPerTrade ?? body.risk_per_trade ?? settings.riskPerTrade
  );
  const initialCash = Number.parseFloat(
    body.initialCash ?? body.initial_cash ?? settings.sizingPreviewCapital ?? 1000
  );

  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 1) {
    throw new Error("Risk per trade must be between 0 and 1.");
  }
  if (!Number.isFinite(initialCash) || initialCash <= 0) {
    throw new Error("Initial cash must be greater than zero.");
  }

  const startDate = normalizeOptionalDate(body.startDate || body.start_date || settings.startDate);
  const endDate = normalizeOptionalDate(body.endDate || body.end_date || settings.endDate);
  validateDateRange(startDate, endDate);

  return {
    symbol: symbols[0],
    symbols,
    universeId: body.universeId || settings.universeId || null,
    universeName: body.universeName || settings.universeName || null,
    universeMode: body.universeMode || (body.universeId || settings.universeId ? "UNIVERSE" : null),
    topN: body.topN || body.limit || null,
    period: normalizeBacktestPeriod(body.period || settings.period || "2y"),
    initialCash,
    startDate,
    endDate,
    riskPerTrade,
    emaFast: Number(settings.emaFast || 20),
    emaSlow: Number(settings.emaSlow || 50),
    rsiThreshold: Number(settings.rsiThreshold || 55),
    atrStopMultiple: Number(settings.atrStopMultiple || 1.5),
    atrTakeProfitMultiple: Number(settings.atrTakeProfitMultiple || 8),
    newsWeight: Number(settings.newsWeight || 0),
    openaiWeight: Number(settings.openaiWeight || 0),
    regimeWeight: Number(settings.regimeWeight || 0),
    signalThreshold: Number(settings.signalThreshold || 60),
    strategy: experiment.name,
    strategyConfig: {
      ...settings,
      strategyJson,
    },
    horizonProfile: {
      key: "STRATEGY_EXPERIMENT",
      name: experiment.name,
      indicator_configuration: {
        ema_fast: Number(settings.emaFast || 20),
        ema_slow: Number(settings.emaSlow || 50),
        rsi_period: 14,
        atr_period: 14,
        volatility_period: 20,
      },
      stop_loss_atr_multiple: Number(settings.atrStopMultiple || 1.5),
      take_profit_atr_multiple: Number(settings.atrTakeProfitMultiple || 8),
      trailing_stop_atr_multiple: Number(settings.atrStopMultiple || 1.5),
      signal_threshold: Number(settings.signalThreshold || 60),
      confidence_weighting: {
        technical: Math.max(
          0,
          1
            - Number(settings.newsWeight || 0)
            - Number(settings.openaiWeight || 0)
            - Number(settings.regimeWeight || 0)
        ),
        news: Number(settings.newsWeight || 0),
        openai: Number(settings.openaiWeight || 0),
        regime: Number(settings.regimeWeight || 0),
      },
    },
  };
}

function buildStrategyRunData(experimentId, backtestOutput) {
  const result = backtestOutput.result || {};
  const completedTradeLog =
    Array.isArray(result.completed_trade_log) && result.completed_trade_log.length > 0
      ? result.completed_trade_log
      : (result.trades || []).filter((trade) => String(trade.type || "").toUpperCase() === "SELL");

  return {
    experimentId,
    returnPct: toNullableNumber(result.total_return_pct),
    cagr: toNullableNumber(result.annualized_return_pct),
    sharpe: toNullableNumber(result.sharpe_ratio),
    maxDrawdown: toNullableNumber(result.max_drawdown_pct),
    winRate: toNullableNumber(result.win_rate_pct),
    expectancy: toNullableNumber(result.expectancy_per_trade),
    volatility: toNullableNumber(result.volatility_pct),
    tradeCount: Number.isInteger(Number(result.completed_trades))
      ? Number(result.completed_trades)
      : null,
    benchmarkReturn: toNullableNumber(result.benchmark_return_pct),
    period: backtestOutput.config?.period || result.period || null,
    settingsJson: {
      ...(backtestOutput.config || {}),
      result_summary: {
        symbol: result.symbol,
        symbols: result.symbols || backtestOutput.config?.symbols || [],
        is_multi_symbol: Boolean(result.is_multi_symbol),
        final_value: result.final_value,
        total_profit: result.total_profit,
        profit_factor: result.profit_factor,
        average_winner: result.average_winner,
        average_loser: result.average_loser,
        largest_winner: result.largest_winner,
        largest_loser: result.largest_loser,
        average_holding_period_days: result.average_holding_period_days,
        buy_and_hold_return_pct: result.buy_and_hold_return_pct,
        benchmark_return_pct: result.benchmark_return_pct,
        benchmark_symbol: result.benchmark_symbol || backtestOutput.config?.benchmark,
        start_price: result.start_price,
        end_price: result.end_price,
        volatility_pct: result.volatility_pct,
        completed_trades: result.completed_trades,
        regime_breakdown: result.regime_breakdown || [],
        regime_timeline: result.regime_timeline || [],
        instrument_type: result.instrument_type || null,
        instrument_constraints: result.instrument_constraints || null,
      },
      equity_curve: result.equity_curve || [],
      drawdown_curve: result.drawdown_curve || [],
      benchmark_curve: result.benchmark_curve || [],
      trades: completedTradeLog,
      raw_trade_events: result.trades || [],
      regime_breakdown:
        result.regime_breakdown || buildRegimeBreakdown(completedTradeLog),
      validation: result.validation || validateBacktestResult(result),
      symbol_results: result.symbol_results || [],
    },
  };
}

function parseOptionalDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildStrategyRunTradeData(runId, trade = {}) {
  const side = String(trade.side || trade.type || "BUY").toUpperCase();
  const decisionSnapshot = trade.decision_snapshot || trade.decisionSnapshot || {
    entryReason: trade.entry_reason || trade.reason || "Generated by executable Strategy Lab backtest rules.",
    exitReason: trade.exit_reason || trade.exitReason || trade.reason || null,
    indicatorContributions: trade.indicator_contributions || trade.contributions || {},
    ruleTree: trade.rule_tree || trade.ruleTree || null,
    confidence: trade.confidence ?? null,
  };

  return {
    runId,
    symbol: trade.symbol ? validateSymbol(trade.symbol) : null,
    side: ["BUY", "SELL"].includes(side) ? side : null,
    entryDate: parseOptionalDate(trade.entry_date ?? trade.entryDate ?? trade.date),
    exitDate: parseOptionalDate(trade.exit_date ?? trade.exitDate ?? trade.date),
    entryPrice: toNullableNumber(trade.entry_price ?? trade.entryPrice ?? trade.price),
    exitPrice: toNullableNumber(trade.exit_price ?? trade.exitPrice ?? trade.price),
    shares: toNullableNumber(trade.shares ?? trade.quantity),
    pnl: toNullableNumber(trade.pnl ?? trade.profit ?? trade.p_l),
    returnPct: toNullableNumber(trade.return_pct ?? trade.returnPct),
    holdingPeriodDays: Number.isInteger(Number(trade.holding_period_days ?? trade.holdingPeriodDays))
      ? Number(trade.holding_period_days ?? trade.holdingPeriodDays)
      : null,
    exitReason: trade.exit_reason ?? trade.exitReason ?? trade.reason ?? null,
    confidence: toNullableNumber(trade.confidence),
    marketRegime:
      trade.market_regime ??
      trade.marketRegime ??
      decisionSnapshot.marketRegime ??
      null,
    sectorContext:
      trade.sector_context ?? trade.sectorContext ?? decisionSnapshot.sectorContext ?? null,
    fitScore:
      toNullableNumber(trade.fit_score ?? trade.fitScore ?? decisionSnapshot.fit?.fitScore),
    instrumentType:
      trade.instrument_type ?? trade.instrumentType ?? decisionSnapshot.instrumentType ?? null,
    stopLoss: toNullableNumber(trade.stop_loss ?? trade.stopLoss),
    trailingStop: toNullableNumber(trade.trailing_stop ?? trade.trailingStop),
    takeProfit: toNullableNumber(trade.take_profit ?? trade.takeProfit),
    decisionSnapshot,
    raw: trade,
  };
}

function getCompletedTradesForRunPersistence(backtestOutput) {
  const result = backtestOutput.result || {};
  const completedTradeLog =
    Array.isArray(result.completed_trade_log) && result.completed_trade_log.length > 0
      ? result.completed_trade_log
      : (result.trades || []).filter((trade) => String(trade.type || "").toUpperCase() === "SELL");

  return completedTradeLog;
}

async function persistStrategyRunTrades(runId, backtestOutput) {
  const trades = getCompletedTradesForRunPersistence(backtestOutput);

  if (trades.length === 0) {
    return [];
  }

  return prisma.run((db) =>
    db.strategyRunTrade.createMany({
      data: trades.map((trade) => buildStrategyRunTradeData(runId, trade)),
    })
  );
}

async function persistMarketRegimeSnapshots(userId, symbol, backtestOutput) {
  const timeline = backtestOutput?.result?.regime_timeline || [];

  if (!userId || !symbol || timeline.length === 0) {
    return 0;
  }

  try {
    return await prisma.run(async (db) => {
      let persisted = 0;
      for (const point of timeline) {
        const asOfDate = parseOptionalDate(point.date);
        if (!asOfDate || !point.regime) {
          continue;
        }
        await db.marketRegimeSnapshot.upsert({
          where: {
            userId_symbol_asOfDate: {
              userId,
              symbol,
              asOfDate,
            },
          },
          create: {
            userId,
            symbol,
            asOfDate,
            regime: point.regime,
            inputsJson: point,
          },
          update: {
            regime: point.regime,
            inputsJson: point,
          },
        });
        persisted += 1;
      }
      return persisted;
    });
  } catch (error) {
    if (
      /marketRegimeSnapshot/i.test(String(error?.message || "")) ||
      /MarketRegimeSnapshot/i.test(String(error?.message || ""))
    ) {
      console.warn("Market regime snapshot persistence unavailable:", error.message);
      return 0;
    }
    throw error;
  }
}

function parseSweepInteger(value, fallback, { min, max, label }) {
  const parsed = Number.parseInt(value ?? fallback, 10);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function normalizeSweepRange(source, key, defaults, label) {
  const min = parseSweepInteger(source?.[`${key}Min`], defaults.min, {
    min: defaults.allowedMin,
    max: defaults.allowedMax,
    label: `${label} minimum`,
  });
  const max = parseSweepInteger(source?.[`${key}Max`], defaults.max, {
    min: defaults.allowedMin,
    max: defaults.allowedMax,
    label: `${label} maximum`,
  });
  const step = parseSweepInteger(source?.[`${key}Step`], defaults.step, {
    min: 1,
    max: defaults.allowedMax - defaults.allowedMin,
    label: `${label} step`,
  });

  if (min > max) {
    throw new Error(`${label} minimum cannot be greater than maximum.`);
  }

  return { min, max, step };
}

function buildSweepValues({ min, max, step }) {
  const values = [];

  for (let value = min; value <= max; value += step) {
    values.push(value);
  }

  if (values[values.length - 1] !== max) {
    values.push(max);
  }

  return [...new Set(values)];
}

function buildParameterSweepConfig(body = {}) {
  const rangesSource = body.ranges || body;
  const emaFast = normalizeSweepRange(
    rangesSource,
    "emaFast",
    { min: 10, max: 30, step: 5, allowedMin: 10, allowedMax: 30 },
    "EMA Fast"
  );
  const emaSlow = normalizeSweepRange(
    rangesSource,
    "emaSlow",
    { min: 40, max: 100, step: 5, allowedMin: 40, allowedMax: 100 },
    "EMA Slow"
  );
  const rsiThreshold = normalizeSweepRange(
    rangesSource,
    "rsi",
    { min: 50, max: 70, step: 5, allowedMin: 50, allowedMax: 70 },
    "RSI"
  );
  const values = {
    emaFast: buildSweepValues(emaFast),
    emaSlow: buildSweepValues(emaSlow),
    rsiThreshold: buildSweepValues(rsiThreshold),
  };
  const totalCombinations =
    values.emaFast.length * values.emaSlow.length * values.rsiThreshold.length;
  const maxCombinations = Math.min(
    Number.parseInt(body.maxCombinations, 10) || 500,
    1000
  );
  const symbols = getBacktestSymbols(body);
  const totalBacktests = totalCombinations * symbols.length;

  if (totalCombinations > maxCombinations) {
    throw new Error(
      `Parameter sweep contains ${totalCombinations} parameter combinations, above the configured limit of ${maxCombinations}. Increase step sizes or raise maxCombinations up to 1000.`
    );
  }
  if (totalBacktests > 25000) {
    throw new Error(
      `Parameter sweep would evaluate ${totalBacktests} combination-symbol pairs, above the safety limit of 25000. Increase step sizes or reduce symbols.`
    );
  }

  return {
    symbol: symbols[0],
    symbols,
    period: normalizeBacktestPeriod(body.period || "2y"),
    ranges: {
      emaFast,
      emaSlow,
      rsiThreshold,
    },
    values,
    totalCombinations,
    totalBacktests,
    maxCombinations,
  };
}

function getSweepRankNumber(value, fallback = -Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compareSweepResults(left, right) {
  const sharpeDiff =
    getSweepRankNumber(right.sharpe) - getSweepRankNumber(left.sharpe);

  if (sharpeDiff !== 0) {
    return sharpeDiff;
  }

  const returnDiff =
    getSweepRankNumber(right.returnPct) - getSweepRankNumber(left.returnPct);

  if (returnDiff !== 0) {
    return returnDiff;
  }

  return (
    Math.abs(getSweepRankNumber(left.maxDrawdown, Infinity)) -
    Math.abs(getSweepRankNumber(right.maxDrawdown, Infinity))
  );
}

function buildSweepResultData(sweepId, backtestOutput) {
  const result = backtestOutput.result || {};
  const config = backtestOutput.config || {};
  const returnPct = toNullableNumber(result.total_return_pct);
  const sharpe = toNullableNumber(result.sharpe_ratio);
  const maxDrawdown = toNullableNumber(result.max_drawdown_pct);

  return {
    sweepId,
    emaFast: Number(config.emaFast),
    emaSlow: Number(config.emaSlow),
    rsiThreshold: Number(config.rsiThreshold),
    returnPct,
    sharpe,
    maxDrawdown,
    winRate: toNullableNumber(result.win_rate_pct),
    expectancy: toNullableNumber(result.expectancy_per_trade),
    cagr: toNullableNumber(result.annualized_return_pct),
    volatility: toNullableNumber(result.volatility_pct),
    tradeCount: Number.isInteger(Number(result.completed_trades))
      ? Number(result.completed_trades)
      : null,
    benchmarkReturn: toNullableNumber(result.buy_and_hold_return_pct),
    rank: null,
    rankScore:
      getSweepRankNumber(sharpe, 0) * 100 +
      getSweepRankNumber(returnPct, 0) -
      Math.abs(getSweepRankNumber(maxDrawdown, 0)),
    resultJson: {
      symbol: result.symbol || null,
      symbols: result.symbols || config.symbols || [],
      symbol_results: result.symbol_results || [],
      period: config.period,
      final_value: result.final_value ?? null,
      total_profit: result.total_profit ?? null,
      profit_factor: result.profit_factor ?? null,
      average_holding_period_days: result.average_holding_period_days ?? null,
    },
  };
}

async function runParameterSweep(experiment, body = {}) {
  const sweepConfig = buildParameterSweepConfig(body);
  const results = [];

  for (const emaFast of sweepConfig.values.emaFast) {
    for (const emaSlow of sweepConfig.values.emaSlow) {
      if (emaFast >= emaSlow) {
        continue;
      }

      for (const rsiThreshold of sweepConfig.values.rsiThreshold) {
        const sweepExperiment = {
          ...experiment,
          settingsJson: {
            ...(experiment.settingsJson || {}),
            emaFast,
            emaSlow,
            rsiThreshold,
          },
        };
        const backtestConfig = buildExperimentBacktestConfig(sweepExperiment, {
          symbols: sweepConfig.symbols,
          period: sweepConfig.period,
        });
        const backtestOutput = await runBacktestLabConfigForSymbols(backtestConfig);
        results.push(buildSweepResultData(null, backtestOutput));
      }
    }
  }

  results.sort(compareSweepResults);

  return {
    config: sweepConfig,
    results,
    topResults: results.slice(0, 20),
  };
}

function getStrategyExperimentId(body, keys) {
  for (const key of keys) {
    if (body?.[key]) {
      return String(body[key]);
    }
  }

  return "";
}

function getComparisonMetric(run, key) {
  const value = Number(run?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function buildStrategyComparisonMetrics(leftRun, rightRun) {
  return {
    returnDifference: Number(
      (
        getComparisonMetric(leftRun, "returnPct") -
        getComparisonMetric(rightRun, "returnPct")
      ).toFixed(4)
    ),
    sharpeDifference: Number(
      (
        getComparisonMetric(leftRun, "sharpe") -
        getComparisonMetric(rightRun, "sharpe")
      ).toFixed(4)
    ),
    drawdownDifference: Number(
      (
        getComparisonMetric(leftRun, "maxDrawdown") -
        getComparisonMetric(rightRun, "maxDrawdown")
      ).toFixed(4)
    ),
    winRateDifference: Number(
      (
        getComparisonMetric(leftRun, "winRate") -
        getComparisonMetric(rightRun, "winRate")
      ).toFixed(4)
    ),
    expectancyDifference: Number(
      (
        getComparisonMetric(leftRun, "expectancy") -
        getComparisonMetric(rightRun, "expectancy")
      ).toFixed(4)
    ),
  };
}

function scoreStrategyRun(run) {
  return (
    getComparisonMetric(run, "returnPct") * 0.35 +
    getComparisonMetric(run, "sharpe") * 15 +
    getComparisonMetric(run, "winRate") * 0.2 +
    getComparisonMetric(run, "expectancy") * 0.1 -
    getComparisonMetric(run, "maxDrawdown") * 0.4
  );
}

function getStrategyComparisonWinner(leftExperiment, rightExperiment, leftRun, rightRun) {
  const leftScore = scoreStrategyRun(leftRun);
  const rightScore = scoreStrategyRun(rightRun);
  const scoreDifference = Number((leftScore - rightScore).toFixed(4));

  if (Math.abs(scoreDifference) < 0.0001) {
    return {
      winner: "TIE",
      reason: "Both experiments are effectively tied across return, Sharpe, drawdown, win rate, and expectancy.",
      scoreDifference,
    };
  }

  const leftWins = scoreDifference > 0;
  const winnerExperiment = leftWins ? leftExperiment : rightExperiment;
  const winningRun = leftWins ? leftRun : rightRun;
  const losingRun = leftWins ? rightRun : leftRun;
  const advantages = [];

  if (getComparisonMetric(winningRun, "returnPct") > getComparisonMetric(losingRun, "returnPct")) {
    advantages.push("higher return");
  }

  if (getComparisonMetric(winningRun, "sharpe") > getComparisonMetric(losingRun, "sharpe")) {
    advantages.push("better Sharpe");
  }

  if (getComparisonMetric(winningRun, "maxDrawdown") < getComparisonMetric(losingRun, "maxDrawdown")) {
    advantages.push("lower drawdown");
  }

  if (getComparisonMetric(winningRun, "winRate") > getComparisonMetric(losingRun, "winRate")) {
    advantages.push("higher win rate");
  }

  if (getComparisonMetric(winningRun, "expectancy") > getComparisonMetric(losingRun, "expectancy")) {
    advantages.push("better expectancy");
  }

  return {
    winner: winnerExperiment.id,
    winnerName: winnerExperiment.name,
    reason: `${winnerExperiment.name} wins on ${advantages.join(", ") || "composite score"}.`,
    scoreDifference,
  };
}
  const { runWalkForward } = createWalkForwardService({
    appendOutput,
    buildExperimentBacktestConfig,
    getProcessFailureMessage,
    getPythonPath,
    parseJsonOutput,
    prisma,
    pythonEngineDir,
    runBacktest: runBacktestLabConfigForSymbols,
    spawn,
  });
  const { runRegimeAnalysis } = createRegimeAnalysisService({ prisma });
  const { runMonteCarloStress } = createMonteCarloService({ prisma });
  const { getStrategyLeaderboard } = createStrategyLeaderboardService({ prisma, strategyStorage });
  const { getStrategyMemory } = createStrategyMemoryService({ prisma, strategyStorage });
  const { simulateStrategyPortfolio } = createPortfolioSimulationService({ prisma });
  const { runMatrixReplay } = createMatrixReplayService({
    appendOutput,
    getProcessFailureMessage,
    getPythonPath,
    parseJsonOutput,
    prisma,
    pythonEngineDir,
    spawn,
    strategyStorage,
  });

  return {
    buildExperimentBacktestConfig,
    buildStrategyComparisonMetrics,
    buildStrategyExperimentSettings,
    buildStrategyExperimentCreateData,
    buildStrategyExperimentUpdateData,
    buildStrategyRunData,
    computeDeploymentReadiness,
    createStrategyVersion,
    getStrategyComparisonWinner,
    getStrategyExperimentId,
    persistMarketRegimeSnapshots,
    persistStrategyRunTrades,
    getStrategyLeaderboard,
    getStrategyMemory,
    runBacktestLabConfigForSymbols,
    runBacktestParameterSweep,
    runStrategyPreview,
    runMonteCarloStress,
    runParameterSweep,
    runRegimeAnalysis,
    runStrategyRobustness,
    runWalkForward,
    runMatrixReplay,
    sanitizeBacktestConfig,
    simulateStrategyPortfolio,
  };
}

module.exports = createStrategyLabService;
