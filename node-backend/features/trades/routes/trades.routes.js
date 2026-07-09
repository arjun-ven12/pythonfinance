const express = require("express");
const { createTradesController } = require("../controllers/trades.controller");

function createTradesRouter(deps) {
  const router = express.Router();
  const controller = createTradesController(deps);

  router.get("/trades", controller.listTrades);
  router.post("/trades", controller.createTrade);

  return router;
}

module.exports = createTradesRouter;
