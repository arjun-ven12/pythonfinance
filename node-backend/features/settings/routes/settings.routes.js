const express = require("express");
const { createSettingsController } = require("../controllers/settings.controller");

function createSettingsRouter(deps) {
  const router = express.Router();
  const controller = createSettingsController(deps);

  router.get("/execution-settings", controller.getExecutionSettings);
  router.post("/execution-settings", controller.saveExecutionSettings);
  router.get("/market-universe-settings", controller.getMarketUniverseSettings);
  router.post("/market-universe-settings", controller.saveMarketUniverseSettings);
  router.post("/safety-settings", controller.saveSafetySettings);

  return router;
}

module.exports = createSettingsRouter;
