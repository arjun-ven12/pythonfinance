const express = require("express");
const createStrategyLabController = require("../controllers/strategyLab.controller");

function createStrategyLabRouter(deps) {
  const router = express.Router();
  const controller = createStrategyLabController(deps);

  router.get("/strategy-experiments", controller.listExperiments);
  router.get("/active-strategy", controller.getActiveStrategy);
  router.post("/active-strategy", controller.setActiveStrategy);
  router.get("/strategy-active-set", controller.getStrategyActiveSet);
  router.post("/strategy-active-set/assign", controller.assignStrategyActiveSet);
  router.post("/strategy-active-set/remove", controller.removeStrategyActiveSet);
  router.post("/strategy-experiments/preview", controller.previewStrategy);
  router.post("/strategy-experiments", controller.createExperiment);
  router.patch("/strategy-experiments/:id", controller.updateExperiment);
  router.delete("/strategy-experiments/:id", controller.deleteExperiment);
  router.post("/strategy-experiments/:id/run", controller.runExperiment);
  router.post(
    "/strategy-experiments/:id/parameter-sweep",
    controller.runExperimentSweep
  );
  router.post(
    "/strategy-experiments/:id/robustness",
    controller.runRobustness
  );
  router.post(
    "/strategy-experiments/:id/walk-forward",
    controller.runWalkForward
  );
  router.post(
    "/strategy-experiments/:id/regime-analysis",
    controller.runRegimeAnalysis
  );
  router.post(
    "/strategy-experiments/:id/stress-test",
    controller.runStressTest
  );
  router.get(
    "/strategy-experiments/:id/memory",
    controller.getStrategyMemory
  );
  router.get(
    "/strategy-lifecycle",
    controller.getStrategyLifecycleDashboard
  );
  router.get(
    "/strategy-deployment-allocation",
    controller.getDeploymentAllocationDashboard
  );
  router.patch(
    "/strategy-deployment-allocation",
    controller.updateDeploymentAllocation
  );
  router.post(
    "/strategy-portfolio-simulation",
    controller.simulateStrategyPortfolio
  );
  router.post(
    "/strategy-matrix-replay",
    controller.runMatrixReplay
  );
  router.get("/strategy-leaderboard", controller.getStrategyLeaderboard);
  router.post("/strategy-compare", controller.compareStrategies);
  router.post("/backtest/parameter-sweep", controller.runBacktestParameterSweep);
  router.post("/backtest", controller.runBacktest);

  return router;
}

module.exports = createStrategyLabRouter;
