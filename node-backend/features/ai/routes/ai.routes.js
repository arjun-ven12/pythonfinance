const express = require("express");
const { createAiController } = require("../controllers/ai.controller");

function createAiRouter({ aiService, aiRateLimiter, requireAdmin, observabilityService }) {
  const router = express.Router();
  const controller = createAiController(aiService, observabilityService);
  const adminOnly =
    requireAdmin ||
    ((_req, res) => res.status(403).json({ error: "Admin access required." }));

  // Read-only observability must not consume the quota reserved for AI invocations.
  router.get("/ai/observability/dashboard", adminOnly, controller.observabilityDashboard);
  router.get("/ai/observability/requests", adminOnly, controller.recentRequests);
  router.get("/ai/observability/requests/:id", adminOnly, controller.requestDetail);
  router.get("/ai/observability/usage/daily", adminOnly, controller.dailyUsage);
  router.get("/ai/observability/usage/monthly", adminOnly, controller.monthlyUsage);
  router.get("/ai/observability/usage/features", adminOnly, controller.featureUsage);
  router.get("/ai/observability/usage/users", adminOnly, controller.userUsage);
  router.get("/ai/observability/cost-summary", adminOnly, controller.costSummary);
  router.get("/ai/observability/largest-requests", adminOnly, controller.largestRequests);
  router.get("/ai/observability/optimization-report", adminOnly, controller.optimizationReport);

  router.use("/ai", aiRateLimiter);
  router.post("/ai/analyze-stock", controller.analyzeStock);
  router.post("/ai/analyze-portfolio", controller.analyzePortfolio);
  router.post("/ai/explain-scanner-result", controller.explainScannerResult);
  router.post("/ai/review-trade", controller.reviewTrade);
  router.post("/ai/summarize-news", controller.summarizeNews);
  router.post("/ai/chat", controller.chat);
  router.get("/ai/diagnostics", adminOnly, controller.diagnostics);
  return router;
}

module.exports = createAiRouter;
