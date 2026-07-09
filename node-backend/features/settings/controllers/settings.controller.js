function createSettingsController(deps) {
  const {
    getDefaultExecutionSettings,
    getDefaultMarketUniverseSettings,
    getExecutionSettingsFromRequest,
    getMarketUniverseSettingsFromRequest,
    parseSafetyPercent,
    readUserSafetyStatus,
    readUserSetting,
    withJsonFallback,
    withPrismaSource,
    writeUserSafetyStatus,
    writeUserSetting,
  } = deps;

  return {
    async getExecutionSettings(req, res) {
      try {
        res.json(await readUserSetting(
          req.user.id,
          "execution_settings",
          getDefaultExecutionSettings()
        ));
      } catch (error) {
        res.json(withJsonFallback(getDefaultExecutionSettings(), error));
      }
    },

    async saveExecutionSettings(req, res) {
      try {
        const current = await readUserSetting(
          req.user.id,
          "execution_settings",
          getDefaultExecutionSettings()
        );
        const value = getExecutionSettingsFromRequest(req.body || {}, current);
        await writeUserSetting(req.user.id, "execution_settings", value);
        res.json(withPrismaSource(value));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async getMarketUniverseSettings(req, res) {
      try {
        res.json(await readUserSetting(
          req.user.id,
          "market_universe_settings",
          getDefaultMarketUniverseSettings()
        ));
      } catch (error) {
        res.json(withJsonFallback(getDefaultMarketUniverseSettings(), error));
      }
    },

    async saveMarketUniverseSettings(req, res) {
      try {
        const current = await readUserSetting(
          req.user.id,
          "market_universe_settings",
          getDefaultMarketUniverseSettings()
        );
        const value = getMarketUniverseSettingsFromRequest(req.body || {}, current);
        await writeUserSetting(req.user.id, "market_universe_settings", value);
        res.json(withPrismaSource(value));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async saveSafetySettings(req, res) {
      try {
        const currentStatus = await readUserSafetyStatus(req.user.id);
        const limits = {};

        if (req.body?.max_daily_loss_pct !== undefined) {
          limits.max_daily_loss_pct = parseSafetyPercent(
            req.body.max_daily_loss_pct,
            "max_daily_loss_pct"
          );
        }

        if (req.body?.max_weekly_loss_pct !== undefined) {
          limits.max_weekly_loss_pct = parseSafetyPercent(
            req.body.max_weekly_loss_pct,
            "max_weekly_loss_pct"
          );
        }

        const status = await writeUserSafetyStatus(req.user.id, {
          ...currentStatus,
          limits,
          settings_source: "dashboard",
        });

        res.json(status);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  };
}

module.exports = { createSettingsController };
