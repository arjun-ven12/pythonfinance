const {
  getDefaultStrategyStorageService,
} = require("../../strategyLab/services/strategyStorage.service");

function createEngineRuntimeService({
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  getPlaybookSourceData,
  getPortfolioForUser,
  getPythonPath,
  getRequestedScanSymbols,
  getRiskMultiplier,
  getScanLimit,
  getTradingHorizon,
  normalizeScanMetadata,
  parseScanArtifacts,
  persistCompletedScan,
  prisma,
  pythonEngineDir,
  readUserSetting,
  scanJobService,
  scannerPath,
  schedulerControllers,
  strategyStorage = getDefaultStrategyStorageService(),
  syncPlaybook,
  writeUserSetting,
}) {
function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultEngineStatus() {
  return {
    is_running: false,
    last_run_at: null,
    next_run_at: null,
    last_duration_seconds: null,
    last_error: null,
    interval: "15min",
    horizon: "SWING",
    market_hours_only: true,
  };
}

async function readEngineStatus(userId) {
  const stored = await prisma.run((db) =>
    db.engineStatus.findUnique({ where: { userId } })
  );
  return {
    ...getDefaultEngineStatus(),
    ...(stored?.status || {}),
    is_running: schedulerControllers.has(userId),
  };
}

async function readUserSafetyStatus(userId) {
  const record = await prisma.run((db) =>
    db.safetySettings.findUnique({ where: { userId } })
  );
  return record?.settings || {
    generated_at: null,
    allow_trade: true,
    allow_new_trades: true,
    risk_level: "LOW",
    emergency_kill_switch: false,
    kill_switch_active: false,
    violations: [],
    limits: {
      max_daily_loss_pct: null,
      max_weekly_loss_pct: null,
      max_position_size_pct: null,
      max_total_portfolio_exposure_pct: null,
      max_sector_exposure_pct: null,
    },
    checks: {},
  };
}

async function writeUserSafetyStatus(userId, nextStatus) {
  const current = await readUserSafetyStatus(userId);
  const status = {
    ...current,
    ...nextStatus,
    generated_at: new Date().toISOString(),
    limits: {
      ...(current.limits || {}),
      ...(nextStatus.limits || {}),
    },
  };
  await prisma.run((db) =>
    db.safetySettings.upsert({
      where: { userId },
      update: { settings: status },
      create: { userId, settings: status },
    })
  );
  return status;
}

  async function readActiveStrategyConfig(userId) {
    const stored = await readUserSetting(userId, "active_strategy", {
      active: false,
      experimentId: null,
      strategyVersionId: null,
      version: null,
      name: "Default Strategy",
      description: "",
      settings: null,
      strategyJson: null,
      ruleSnapshot: null,
      readiness: null,
      activationRules: null,
      updatedAt: null,
    });

    const deploymentSet = await prisma.run((db) =>
      db.strategyDeploymentSet?.findUnique
        ? db.strategyDeploymentSet.findUnique({
            where: { userId },
          })
        : Promise.resolve(null)
    );
    const [versionRecord, experimentRecord] = await prisma.run((db) =>
      Promise.all([
        (deploymentSet?.ownerStrategyVersionId ||
        stored.strategyVersionId ||
        deploymentSet?.ownerExperimentId ||
        stored.experimentId)
          ? db.strategyVersion.findFirst({
              where: {
                userId,
                ...(deploymentSet?.ownerStrategyVersionId || stored.strategyVersionId
                  ? { id: deploymentSet?.ownerStrategyVersionId || stored.strategyVersionId }
                  : {
                      experimentId: deploymentSet?.ownerExperimentId || stored.experimentId,
                      deploymentStatus: "ACTIVE",
                    }),
              },
              include: {
                experiment: true,
              },
            })
          : Promise.resolve(null),
        (deploymentSet?.ownerExperimentId || stored.experimentId)
          ? db.strategyExperiment.findFirst({
              where: {
                id: deploymentSet?.ownerExperimentId || stored.experimentId,
                userId,
              },
            })
          : Promise.resolve(null),
      ])
    );

    const version = strategyStorage.hydrateStrategyVersionRecord(versionRecord);
    const experiment = strategyStorage.hydrateStrategyExperimentRecord(experimentRecord);
    const settings = version?.settingsJson || experiment?.settingsJson || null;
    const strategyJson = version?.strategyJson || settings?.strategyJson || null;
    const active = Boolean(
      (deploymentSet?.ownerExperimentId && deploymentSet?.ownerStrategyVersionId) ||
      (stored?.active && stored?.experimentId)
    );
    const hasCanonicalDeployment = Boolean(
      deploymentSet?.ownerExperimentId && deploymentSet?.ownerStrategyVersionId
    );
    const resolutionWarnings = [];
    if (hasCanonicalDeployment && !version) {
      resolutionWarnings.push(
        "Canonical deployment owner is set but its strategy version could not be loaded."
      );
    }
    if (
      hasCanonicalDeployment &&
      stored?.active &&
      (stored.experimentId !== deploymentSet?.ownerExperimentId ||
        stored.strategyVersionId !== deploymentSet?.ownerStrategyVersionId)
    ) {
      resolutionWarnings.push(
        "Stored active_strategy metadata differs from the canonical deployment owner."
      );
    }

    if (!active) {
      return stored;
    }

    return {
      ...stored,
      active,
      experimentId:
        deploymentSet?.ownerExperimentId ||
        version?.experimentId ||
        version?.experiment?.id ||
        stored.experimentId ||
        null,
      strategyVersionId:
        deploymentSet?.ownerStrategyVersionId ||
        version?.id ||
        stored.strategyVersionId ||
        null,
      version:
        (hasCanonicalDeployment ? version?.version : stored.version) ||
        version?.version ||
        stored.version ||
        null,
      name:
        (hasCanonicalDeployment ? experiment?.name : stored.name) ||
        experiment?.name ||
        stored.name ||
        "Default Strategy",
      description:
        hasCanonicalDeployment
          ? experiment?.description || stored.description || ""
          : stored.description !== undefined && stored.description !== null
            ? stored.description
            : experiment?.description || "",
      settings,
      strategyJson,
      resolution: {
        source: hasCanonicalDeployment
          ? "canonical_deployment"
          : "stored_active_strategy",
        warnings: resolutionWarnings,
      },
    };
  }

async function writeActiveStrategyConfig(userId, config) {
  const nextConfig = {
    active: Boolean(config?.experimentId),
    experimentId: config?.experimentId || null,
    strategyVersionId: config?.strategyVersionId || null,
    version: config?.version || null,
    name: config?.name || "Default Strategy",
    description: config?.description || "",
    settings: null,
    strategyJson: null,
    ruleSnapshot: config?.ruleSnapshot || null,
    readiness: config?.readiness || null,
    activationRules: config?.activationRules || null,
    deployment: config?.deployment || null,
    updatedAt: new Date().toISOString(),
  };

  await writeUserSetting(userId, "active_strategy", nextConfig);
  return nextConfig;
}

function buildStrategyRuntimeConfig(activeStrategy, strategyJsonOverride = null, settingsOverride = null) {
  const settings = activeStrategy?.settings || {};
  const effectiveSettings = settingsOverride || settings;
  const effectiveStrategyJson =
    strategyJsonOverride || activeStrategy?.strategyJson || effectiveSettings?.strategyJson || null;

  if (!activeStrategy?.active || !effectiveSettings) {
    return null;
  }

  return {
    experiment_id: activeStrategy.experimentId,
    strategy_version_id: activeStrategy.strategyVersionId || null,
    version: activeStrategy.version || null,
    name: activeStrategy.name,
    description: activeStrategy.description,
    strategy_json: effectiveStrategyJson,
    rule_snapshot: activeStrategy.ruleSnapshot || null,
    ema_fast: effectiveSettings.emaFast,
    ema_slow: effectiveSettings.emaSlow,
    rsi_threshold: effectiveSettings.rsiThreshold,
    atr_stop_multiple: effectiveSettings.atrStopMultiple,
    atr_take_profit_multiple: effectiveSettings.atrTakeProfitMultiple,
    news_weight: effectiveSettings.newsWeight,
    openai_weight: effectiveSettings.openaiWeight,
    regime_weight: effectiveSettings.regimeWeight,
    risk_per_trade: effectiveSettings.riskPerTrade,
    signal_threshold: effectiveSettings.signalThreshold,
  };
}

async function buildScannerStrategyConfig(activeStrategy, userId) {
  const baseConfig = buildStrategyRuntimeConfig(activeStrategy);

  if (!baseConfig || !userId) {
    return baseConfig;
  }

  const allocationMatrix =
    baseConfig.strategy_json?.executable?.allocationMatrix || {};
  const matrixEntries = Object.entries(allocationMatrix).filter(
    ([, value]) => value && typeof value === "object" && value.active !== false
  );

  if (!matrixEntries.length) {
    return baseConfig;
  }

  const strategyVersionIds = [
    ...new Set(
      matrixEntries
        .map(([, value]) => value.strategyVersionId)
        .filter(Boolean)
    ),
  ];
  const experimentIds = [
    ...new Set(
      matrixEntries
        .map(([, value]) => value.experimentId)
        .filter(Boolean)
    ),
  ];

  const [versionRecords, experimentRecords] = await prisma.run((db) =>
    Promise.all([
      strategyVersionIds.length
        ? db.strategyVersion.findMany({
            where: {
              userId,
              id: { in: strategyVersionIds },
            },
            include: {
              experiment: true,
            },
          })
        : Promise.resolve([]),
      experimentIds.length
        ? db.strategyExperiment.findMany({
            where: {
              userId,
              id: { in: experimentIds },
            },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
    ])
  );

  const versions = versionRecords.map((version) =>
    strategyStorage.hydrateStrategyVersionRecord(version)
  );
  const experiments = experimentRecords.map((experiment) =>
    strategyStorage.hydrateStrategyExperimentRecord(experiment)
  );
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  const matrixStrategyConfigs = {};

  for (const [cellKey, cell] of matrixEntries) {
    const version =
      (cell.strategyVersionId && versionById.get(cell.strategyVersionId)) ||
      null;
    const experiment =
      (version?.experiment) ||
      (cell.experimentId && experimentById.get(cell.experimentId)) ||
      null;
    const latestVersion =
      version || experiment?.versions?.[0] || null;
    const effectiveSettings =
      latestVersion?.settingsJson || experiment?.settingsJson || null;
    const effectiveStrategyJson =
      latestVersion?.strategyJson || effectiveSettings?.strategyJson || null;

    if (!experiment || !effectiveSettings || !effectiveStrategyJson) {
      continue;
    }

    matrixStrategyConfigs[cellKey] = {
      ...buildStrategyRuntimeConfig(
        {
          ...activeStrategy,
          experimentId: experiment.id,
          strategyVersionId: latestVersion?.id || null,
          version: latestVersion?.version || null,
          name: experiment.name,
          description: experiment.description,
          settings: effectiveSettings,
          strategyJson: effectiveStrategyJson,
        },
        effectiveStrategyJson,
        effectiveSettings
      ),
      strategy_name: experiment.name,
      cell_key: cellKey,
      allocation_pct: toNumber(cell.allocationPct, null),
      route_status: cell.status || (cell.active === false ? "PENDING" : "ACTIVE"),
    };
  }

  return {
    ...baseConfig,
    allocation_matrix_strategy_configs: matrixStrategyConfigs,
  };
}

function parseSafetyPercent(value, fieldName) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${fieldName} must be between 0 and 1.`);
  }

  return parsed;
}

async function writeEngineStatus(userId, nextStatus) {
  const current = await readEngineStatus(userId);
  const status = {
    ...getDefaultEngineStatus(),
    ...current,
    ...nextStatus,
  };

  await prisma.run((db) =>
    db.engineStatus.upsert({
      where: { userId },
      update: { status },
      create: { userId, status },
    })
  );

  return status;
}

function buildScannerArgs(
  userId,
  limit,
  riskMultiplier,
  horizon,
  symbols = [],
  strategyConfig = null,
  universeSettings = getDefaultMarketUniverseSettings(),
  executionSettings = getDefaultExecutionSettings(),
  portfolioState = {}
) {
  const scannerArgs = [
    scannerPath,
    "--user-id",
    userId,
    "--limit",
    String(limit),
    "--horizon",
    getTradingHorizon(horizon),
    "--universe",
    universeSettings.universe_mode,
    "--market",
    universeSettings.market || "US",
    "--exchange",
    universeSettings.exchange || "ALL",
    "--currency",
    universeSettings.currency || "AUTO",
    "--min-market-cap",
    String(universeSettings.min_market_cap),
    "--min-average-volume",
    String(universeSettings.min_average_volume),
    "--execution-settings",
    JSON.stringify(executionSettings),
    "--portfolio-json",
    JSON.stringify(portfolioState),
  ];

  if (universeSettings.max_market_cap !== null && universeSettings.max_market_cap !== undefined) {
    scannerArgs.push("--max-market-cap", String(universeSettings.max_market_cap));
  }

  if (universeSettings.include_non_sp500) {
    scannerArgs.push("--include-non-sp500");
  }

  if (universeSettings.exclude_penny_stocks) {
    scannerArgs.push("--exclude-penny-stocks");
  } else {
    scannerArgs.push("--allow-penny-stocks");
  }

  if (universeSettings.high_risk_mode) {
    scannerArgs.push("--high-risk-mode");
  }

  if (universeSettings.include_sgx) {
    scannerArgs.push("--include-sgx");
  }

  if (riskMultiplier !== null) {
    scannerArgs.push("--risk-multiplier", String(riskMultiplier));
  }

  if (symbols.length > 0) {
    scannerArgs.push("--symbols", symbols.join(","));
  }

  if (strategyConfig) {
    scannerArgs.push("--strategy-config", JSON.stringify(strategyConfig));
  }

  return scannerArgs;
}

async function startScanJobForUser(userId, body = {}, type = "MANUAL") {
  const limit = getScanLimit(body.limit);
  const riskMultiplier = getRiskMultiplier(body.riskMultiplier);
  const horizon = getTradingHorizon(body.horizon ?? body.tradingHorizon);
  const scanSymbols = await getRequestedScanSymbols(body, userId);
  const activeStrategy = await readActiveStrategyConfig(userId);
  const scannerStrategyConfig = await buildScannerStrategyConfig(activeStrategy, userId);
  const currentMarketUniverseSettings = await readUserSetting(
    userId,
    "market_universe_settings",
    getDefaultMarketUniverseSettings()
  );
  const marketUniverseSettings = getMarketUniverseSettingsFromRequest(
    body,
    currentMarketUniverseSettings
  );
  const currentExecutionSettings = await readUserSetting(
    userId,
    "execution_settings",
    getDefaultExecutionSettings()
  );
  const executionSettings = getExecutionSettingsFromRequest(
    body,
    currentExecutionSettings
  );

  await Promise.all([
    writeUserSetting(userId, "market_universe_settings", marketUniverseSettings),
    writeUserSetting(userId, "execution_settings", executionSettings),
  ]);

  const storedPortfolio = await getPortfolioForUser(userId);
  const scannerArgs = buildScannerArgs(
    userId,
    limit,
    riskMultiplier,
    horizon,
    scanSymbols,
    scannerStrategyConfig,
    marketUniverseSettings,
    executionSettings,
    storedPortfolio.ledgerState
  );
  const scanStartedAt = Date.now();
  const source = type === "SCHEDULED" ? "scheduler" : "manual";

  return scanJobService.startJob({
    userId,
    type,
    command: getPythonPath(),
    args: scannerArgs,
    cwd: pythonEngineDir,
    timeoutMs:
      type === "SCHEDULED"
        ? Number(process.env.SCHEDULED_SCAN_TIMEOUT_MS) || 10 * 60 * 1000
        : Number(process.env.MANUAL_SCAN_TIMEOUT_MS) || 5 * 60 * 1000,
    symbolsTotal: scanSymbols.length || limit,
    metadata: {
      source,
      horizon,
      limit,
      market: marketUniverseSettings.market,
      exchange: marketUniverseSettings.exchange,
      scanSymbolsOnly: Boolean(body.scanSymbolsOnly),
      scanWatchlistOnly: Boolean(body.scanWatchlistOnly),
    },
    onCompleted: async ({ stdout, artifactLine }) => {
      const scannerArtifacts = parseScanArtifacts(artifactLine || stdout);
      const scanDurationSeconds = (Date.now() - scanStartedAt) / 1000;
      const scanResults = {
        ...normalizeScanMetadata(
          scannerArtifacts.scan_results,
          scanDurationSeconds
        ),
        active_strategy: {
          id: activeStrategy.experimentId || null,
          experimentId: activeStrategy.experimentId || null,
          strategyVersionId: activeStrategy.strategyVersionId || null,
          version: activeStrategy.version || null,
          name: activeStrategy.name,
          deploymentStatus: activeStrategy.active ? "ACTIVE" : "DEFAULT",
          ruleSnapshot: activeStrategy.ruleSnapshot || null,
        },
        strategy_version_id: activeStrategy.strategyVersionId || null,
        active_strategy_config: activeStrategy,
        market_universe_settings: marketUniverseSettings,
      };
      const persistence = await persistCompletedScan({
        scanResults,
        userId,
        durationSeconds: scanDurationSeconds,
        source,
        startedAt: new Date(scanStartedAt),
        alerts: scannerArtifacts.alerts || [],
        proposedOrders: scannerArtifacts.proposed_orders || { orders: [] },
      });

      try {
        await syncPlaybook(userId, await getPlaybookSourceData(userId));
      } catch (playbookError) {
        console.error(`Playbook sync skipped: ${playbookError.message}`);
      }

      return {
        scanId: persistence.scanId,
        engineRunId: persistence.engineRunId,
        opportunityCount: scanResults.opportunities?.length || 0,
        scanSummary: scanResults.scan_summary || null,
        generatedAt: scanResults.generated_at,
        dataSource: "PRISMA",
      };
    },
  });
}

function getMarketClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.weekday,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function isConfiguredMarketOpen(market = "US", date = new Date()) {
  const normalizedMarket = String(market || "US").toUpperCase();
  const markets = normalizedMarket === "BOTH" ? ["US", "SG"] : [normalizedMarket];

  return markets.some((marketCode) => {
    const isSingapore = marketCode === "SG";
    const clock = getMarketClock(
      date,
      isSingapore ? "Asia/Singapore" : "America/New_York"
    );

    if (["Sat", "Sun"].includes(clock.weekday)) {
      return false;
    }

    if (isSingapore) {
      return (
        (clock.minutes >= 9 * 60 && clock.minutes <= 12 * 60) ||
        (clock.minutes >= 13 * 60 && clock.minutes <= 17 * 60)
      );
    }

    return clock.minutes >= 9 * 60 + 30 && clock.minutes <= 16 * 60;
  });
}

function stopUserScheduler(userId) {
  const controller = schedulerControllers.get(userId);
  if (!controller) return false;
  controller.stopped = true;
  if (controller.timer) {
    clearTimeout(controller.timer);
  }
  schedulerControllers.delete(userId);
  return true;
}

async function startScheduler({
  interval,
  limit,
  riskMultiplier,
  marketHoursOnly,
  horizon,
  symbols = [],
  marketUniverseSettings = getDefaultMarketUniverseSettings(),
  executionSettings = getDefaultExecutionSettings(),
  portfolioState = {},
  strategyConfig = null,
  userId,
}) {
  const tradingHorizon = getTradingHorizon(horizon);
  const intervalMilliseconds = {
    "5min": 5 * 60 * 1000,
    "15min": 15 * 60 * 1000,
    "30min": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
  }[interval];
  const controller = {
    stopped: false,
    timer: null,
  };
  schedulerControllers.set(userId, controller);

  const scheduleNext = async () => {
    if (controller.stopped) return;
    const nextRunAt = new Date(Date.now() + intervalMilliseconds);
    await writeEngineStatus(userId, {
      is_running: true,
      next_run_at: nextRunAt.toISOString(),
      interval,
      horizon: tradingHorizon,
      market_hours_only: marketHoursOnly,
    });
    controller.timer = setTimeout(runCycle, intervalMilliseconds);
    controller.timer.unref?.();
  };

  const runCycle = async () => {
    if (controller.stopped) return;
    const market = marketUniverseSettings.market || "US";

    if (!marketHoursOnly || isConfiguredMarketOpen(market)) {
      try {
        await startScanJobForUser(
          userId,
          {
            limit,
            riskMultiplier,
            tradingHorizon,
            symbols,
            scanSymbolsOnly: symbols.length > 0,
            executionSettings,
            marketUniverseSettings,
            portfolioState,
            strategyConfig,
          },
          "SCHEDULED"
        );
        await writeEngineStatus(userId, {
          is_running: true,
          last_error: null,
          interval,
          horizon: tradingHorizon,
          market_hours_only: marketHoursOnly,
        });
      } catch (error) {
        await writeEngineStatus(userId, {
          is_running: true,
          last_error: error.message,
          interval,
          horizon: tradingHorizon,
          market_hours_only: marketHoursOnly,
        });
      }
    } else {
      await writeEngineStatus(userId, {
        is_running: true,
        last_error: `outside ${market === "SG" ? "Singapore" : market === "BOTH" ? "US or Singapore" : "US"} market hours`,
        interval,
        horizon: tradingHorizon,
        market_hours_only: marketHoursOnly,
      });
    }

    await scheduleNext();
  };

  const status = await writeEngineStatus(userId, {
    is_running: true,
    last_error: null,
    interval,
    horizon: tradingHorizon,
    market_hours_only: marketHoursOnly,
  });
  setImmediate(() => void runCycle());
  return status;
}


  return {
    buildScannerArgs,
    buildScannerStrategyConfig,
    getDefaultEngineStatus,
    isConfiguredMarketOpen,
    parseSafetyPercent,
    readActiveStrategyConfig,
    readEngineStatus,
    readUserSafetyStatus,
    startScanJobForUser,
    startScheduler,
    stopUserScheduler,
    writeActiveStrategyConfig,
    writeEngineStatus,
    writeUserSafetyStatus,
  };
}

module.exports = createEngineRuntimeService;
