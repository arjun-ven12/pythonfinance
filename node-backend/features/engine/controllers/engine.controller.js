function createEngineController(deps) {
  const {
    allowedIntervals,
    buildDataHealth,
    buildScannerStrategyConfig,
    getDefaultExecutionSettings,
    getDefaultMarketUniverseSettings,
    getExecutionSettingsFromRequest,
    getMarketUniverseSettingsFromRequest,
    getPortfolioForUser,
    getRiskMultiplier,
    getScanLimit,
    getRequestedScanSymbols,
    getSystemDataHealth,
    readActiveStrategyConfig,
    readEngineStatus,
    readUserSafetyStatus,
    readUserSetting,
    schedulerControllers,
    startScanJobForUser,
    startScheduler,
    stopUserScheduler,
    writeEngineStatus,
    writeUserSetting,
  } = deps;

  return {
    async getEngineStatus(req, res) {
      try {
        res.json(await readEngineStatus(req.user.id));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getDataHealth(req, res) {
      res.json(await buildDataHealth(req.user.id));
    },

    async getSystemDataHealth(_req, res) {
      const health = await getSystemDataHealth();
      res.status(health.degradedMode ? 503 : 200).json(health);
    },

    async getSafetyStatus(req, res) {
      try {
        res.json(await readUserSafetyStatus(req.user.id));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async startEngine(req, res) {
      if (schedulerControllers.has(req.user.id)) {
        return res.status(409).json({
          error: "Engine is already running for this user.",
          status: await readEngineStatus(req.user.id),
        });
      }

      const interval = String(req.body?.interval || "15min");
      const currentExecutionSettings = await readUserSetting(
        req.user.id,
        "execution_settings",
        getDefaultExecutionSettings()
      );
      const executionSettings = getExecutionSettingsFromRequest(
        req.body || {},
        currentExecutionSettings
      );
      await writeUserSetting(req.user.id, "execution_settings", executionSettings);
      const currentMarketUniverseSettings = await readUserSetting(
        req.user.id,
        "market_universe_settings",
        getDefaultMarketUniverseSettings()
      );
      const marketUniverseSettings = getMarketUniverseSettingsFromRequest(
        req.body || {},
        currentMarketUniverseSettings
      );
      await writeUserSetting(
        req.user.id,
        "market_universe_settings",
        marketUniverseSettings
      );

      if (!allowedIntervals.has(interval)) {
        return res.status(400).json({
          error: "Interval must be one of 5min, 15min, 30min, or 1h.",
        });
      }

      try {
        const scanSymbols = await getRequestedScanSymbols(
          req.body || {},
          req.user.id
        );
        const activeStrategy = await readActiveStrategyConfig(req.user.id);
        const schedulerPortfolio = await getPortfolioForUser(req.user.id);
        const status = await startScheduler({
          interval,
          limit: getScanLimit(req.body?.limit),
          riskMultiplier: getRiskMultiplier(req.body?.riskMultiplier),
          marketHoursOnly: req.body?.marketHoursOnly !== false,
          horizon: req.body?.horizon ?? req.body?.tradingHorizon,
          symbols: scanSymbols,
          marketUniverseSettings,
          executionSettings,
          portfolioState: schedulerPortfolio.ledgerState,
          strategyConfig: buildScannerStrategyConfig(activeStrategy),
          userId: req.user.id,
        });
        res.json(status);
      } catch (error) {
        stopUserScheduler(req.user.id);
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async stopEngine(req, res) {
      if (!schedulerControllers.has(req.user.id)) {
        const status = await writeEngineStatus(req.user.id, {
          is_running: false,
          next_run_at: null,
        });
        return res.json(status);
      }

      stopUserScheduler(req.user.id);
      const status = await writeEngineStatus(req.user.id, {
        is_running: false,
        next_run_at: null,
        last_error: null,
      });
      res.json(status);
    },

    async runScan(req, res) {
      try {
        const job = await startScanJobForUser(
          req.user.id,
          req.body || {},
          "MANUAL"
        );
        res.status(202).json({
          job,
          deprecatedEndpoint: true,
          canonicalEndpoint: "/api/scans/start",
        });
      } catch (error) {
        res.status(error.statusCode || 500).json({
          error: error.message,
          job: error.job ? deps.scanJobService.serializeJob(error.job) : undefined,
        });
      }
    },
  };
}

module.exports = { createEngineController };
