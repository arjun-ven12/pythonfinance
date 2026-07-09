const express = require("express");
const { createMarketDataController } = require("../controllers/marketData.controller");

function createMarketDataRouter(deps) {
  const router = express.Router();
  const controller = createMarketDataController(deps);

  router.get("/market-data/metrics", controller.getMetrics);
  router.get("/market-data/quotes", controller.getQuotes);
  router.get("/market-data/providers/health", controller.getProviderHealth);
  router.get("/market-data/:symbol/quote", controller.getQuote);
  router.get("/market-data/:symbol/price-history", controller.getPriceHistory);
  router.get("/chart-data/:symbol", controller.getChartData);

  return router;
}

module.exports = createMarketDataRouter;
