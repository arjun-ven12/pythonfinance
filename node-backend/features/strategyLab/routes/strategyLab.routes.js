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
  router.post("/strategy-experiments/generate-draft", controller.generateStrategyDraft);
  router.post("/strategy-experiments/explain", controller.explainStrategy);
  router.post("/strategy-experiments/review", controller.reviewStrategy);
  router.post("/strategy-experiments/question", controller.askStrategyQuestion);
  router.post("/strategy-experiments/research-report", controller.generateStrategyResearchReport);
  router.post("/strategy-experiments/research-question", controller.answerStrategyResearchQuestion);
  router.post("/strategy-experiments/version-compare", controller.compareStrategyVersions);
  router.post("/strategy-experiments/propose-edit", controller.proposeStrategyEdit);
  router.post("/strategy-experiments/approve-edit", controller.approveStrategyEdit);
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
  router.post("/strategy-matrix/copilot", controller.matrixCopilot);
  router.post("/strategy-lab/matrix-copilot/recommend", controller.matrixRecommendation);
  router.post("/strategy-lab/matrix-copilot/scenario", controller.matrixScenario);
  router.post("/strategy-lab/matrix-copilot/compare", controller.matrixAlternativeComparison);
  router.get("/strategy-lab/matrix-copilot/proposals", controller.listMatrixProposals);
  router.post("/strategy-lab/matrix-copilot/proposals", controller.saveMatrixProposal);
  router.get("/strategy-lab/matrix-copilot/proposals/:id", controller.getMatrixProposal);
  router.patch("/strategy-lab/matrix-copilot/proposals/:id", controller.renameMatrixProposal);
  router.delete("/strategy-lab/matrix-copilot/proposals/:id", controller.deleteMatrixProposal);
  router.post("/strategy-lab/matrix-copilot/proposals/:id/duplicate", controller.duplicateMatrixProposal);
  router.post("/strategy-lab/matrix-copilot/proposals/:id/restore", controller.restoreMatrixProposal);
  router.post("/strategy-lab/matrix-copilot/proposals/:id/reject", controller.rejectMatrixProposal);
  router.post("/strategy-lab/matrix-copilot/proposals/:id/approve", controller.approveMatrixProposal);
  router.get("/strategy-leaderboard", controller.getStrategyLeaderboard);
  router.post("/strategy-compare/copilot", controller.compareStrategiesCopilot);
  router.post("/strategy-compare", controller.compareStrategies);
  router.post("/backtest/parameter-sweep", controller.runBacktestParameterSweep);
  router.post("/backtest", controller.runBacktest);

  return router;
}

module.exports = createStrategyLabRouter;
