const express = require("express");
const { createAiController } = require("../controllers/ai.controller");

function createAiRouter({ aiService, aiRateLimiter }) {
  const router = express.Router();
  const controller = createAiController(aiService);

  router.use(aiRateLimiter);
  router.post("/ai/analyze-stock", controller.analyzeStock);
  router.post("/ai/analyze-portfolio", controller.analyzePortfolio);
  router.post("/ai/explain-scanner-result", controller.explainScannerResult);
  router.post("/ai/review-trade", controller.reviewTrade);
  router.post("/ai/summarize-news", controller.summarizeNews);
  router.post("/ai/chat", controller.chat);

  return router;
}

module.exports = createAiRouter;
