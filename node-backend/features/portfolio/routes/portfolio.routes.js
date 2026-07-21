const express = require("express");
const { createPortfolioController } = require("../controllers/portfolio.controller");

function createPortfolioRouter(deps) {
  const router = express.Router();
  const controller = createPortfolioController(deps);
  const aiRateLimiter = deps.aiRateLimiter || ((_req, _res, next) => next());

  router.post("/portfolio/copilot/overview", aiRateLimiter, controller.generateCopilotOverview);
  router.post("/portfolio/copilot/ask", aiRateLimiter, controller.askCopilot);
  router.post("/portfolio/copilot/recommend", aiRateLimiter, controller.recommendWithCopilot);
  router.post("/portfolio/copilot/scenario", aiRateLimiter, controller.simulateWithCopilot);
  router.post("/portfolio/copilot/compare", aiRateLimiter, controller.compareWithCopilot);
  router.post("/portfolio/copilot/proposal", aiRateLimiter, controller.simulateWithCopilot);
  router.get("/portfolio/copilot/proposals", controller.listCopilotProposals);
  router.post("/portfolio/copilot/proposals", controller.saveCopilotProposal);
  router.post("/portfolio/copilot/proposals/:id/approve", controller.approveCopilotProposal);
  router.post("/portfolio/copilot/proposals/:id/reject", controller.rejectCopilotProposal);

  router.get("/risk-dashboard", controller.getRiskDashboard);
  router.get("/portfolio-construction", controller.getPortfolioConstruction);
  router.get("/paper-portfolio", controller.getPaperPortfolio);
  router.get("/portfolio-reconciliation", controller.getPortfolioReconciliation);
  router.post("/portfolio/recompute", controller.recomputePortfolio);
  router.get("/paper-ledger/integrity", controller.getPaperLedgerIntegrity);
  router.get("/paper-trades", controller.getPaperTrades);

  return router;
}

module.exports = createPortfolioRouter;
