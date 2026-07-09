const express = require("express");
const { createWatchlistController } = require("../controllers/watchlist.controller");

function createWatchlistRouter(deps) {
  const router = express.Router();
  const controller = createWatchlistController(deps);

  router.get("/watchlist", controller.listWatchlist);
  router.post("/watchlist", controller.upsertWatchlist);
  router.delete("/watchlist/:symbol", controller.removeWatchlist);

  return router;
}

module.exports = createWatchlistRouter;
