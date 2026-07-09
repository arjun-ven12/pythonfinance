const express = require("express");
const { createEngineController } = require("../controllers/engine.controller");

function createEngineRouter(deps) {
  const router = express.Router();
  const controller = createEngineController(deps);

  router.get("/engine-status", controller.getEngineStatus);
  router.get("/data-health", controller.getDataHealth);
  router.get("/system/data-health", controller.getSystemDataHealth);
  router.get("/safety-status", controller.getSafetyStatus);
  router.post("/start-engine", controller.startEngine);
  router.post("/stop-engine", controller.stopEngine);
  router.post("/run-scan", controller.runScan);

  return router;
}

module.exports = createEngineRouter;
