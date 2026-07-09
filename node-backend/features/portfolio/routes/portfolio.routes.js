const express = require("express");
const { createPortfolioController } = require("../controllers/portfolio.controller");

function createPortfolioRouter(deps) {
  const router = express.Router();
  const controller = createPortfolioController(deps);

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
