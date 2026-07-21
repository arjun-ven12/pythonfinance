const express = require("express");
const { createResearchController } = require("../controllers/research.controller");

function createResearchRouter(deps) {
  const router = express.Router(); const controller = createResearchController(deps);
  const aiRateLimiter = deps.aiRateLimiter || ((_req, _res, next) => next());
  router.get("/research/projects", controller.listProjects);
  router.post("/research/projects", controller.createProject);
  router.get("/research/projects/:id", controller.getProject);
  router.patch("/research/projects/:id", controller.updateProject);
  router.post("/research/projects/:id/archive", controller.archiveProject);
  router.post("/research/projects/:id/restore", controller.restoreProject);
  router.get("/research/projects/:id/reports", controller.listReports);
  router.post("/research/projects/:id/reports", aiRateLimiter, controller.generateReport);
  router.post("/research/projects/:id/ask", aiRateLimiter, controller.projectQuestion);
  router.post("/research/projects/:id/notes", controller.addNote);
  router.post("/research/projects/:id/thesis", controller.createThesis);
  router.post("/research/projects/:id/thesis/review", aiRateLimiter, controller.reviewThesis);
  router.post("/research/projects/:id/compare", aiRateLimiter, controller.projectComparison);
  router.post("/research/projects/:id/changes", aiRateLimiter, controller.projectChanges);
  router.post("/research/copilot/overview", aiRateLimiter, controller.overview);
  router.post("/research/copilot/ask", aiRateLimiter, controller.ask);
  router.post("/research/copilot/symbol", aiRateLimiter, controller.symbol);
  router.post("/research/copilot/sector", aiRateLimiter, controller.sector);
  router.post("/research/copilot/scanner-summary", aiRateLimiter, controller.scanner);
  router.post("/research/copilot/watchlist-summary", aiRateLimiter, controller.watchlist);
  router.post("/research/copilot/upcoming", aiRateLimiter, controller.upcoming);
  router.post("/research/copilot/deep", aiRateLimiter, controller.deep);
  router.post("/research/copilot/impact/market", aiRateLimiter, controller.marketImpact);
  router.post("/research/copilot/impact/portfolio", aiRateLimiter, controller.portfolioImpact);
  router.post("/research/copilot/impact/strategy", aiRateLimiter, controller.strategyImpact);
  router.post("/research/copilot/impact/matrix", aiRateLimiter, controller.matrixImpact);
  router.post("/research/copilot/impact/scanner", aiRateLimiter, controller.scannerImpact);
  router.post("/research/copilot/compare", aiRateLimiter, controller.compare);
  router.post("/research/copilot/theme", aiRateLimiter, controller.theme);
  router.post("/research/copilot/company", aiRateLimiter, controller.company);
  return router;
}
module.exports = createResearchRouter;
