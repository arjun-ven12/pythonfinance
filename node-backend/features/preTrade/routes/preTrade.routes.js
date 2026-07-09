const express = require("express");
const createPreTradeController = require("../controllers/preTrade.controller");

function createPreTradeRouter(deps) {
  const router = express.Router();
  const controller = createPreTradeController(deps);

  router.post("/pre-trade-analysis", controller.analyze);

  return router;
}

module.exports = createPreTradeRouter;
