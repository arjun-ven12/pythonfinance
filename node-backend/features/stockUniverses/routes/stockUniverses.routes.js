const express = require("express");
const { createStockUniversesController } = require("../controllers/stockUniverses.controller");

function createStockUniversesRouter(deps) {
  const router = express.Router();
  const controller = createStockUniversesController(deps);

  router.get("/stock-universes", controller.list);
  router.get("/stock-universes/:id", controller.get);
  router.post("/stock-universes", controller.create);
  router.patch("/stock-universes/:id", controller.update);
  router.delete("/stock-universes/:id", controller.remove);
  router.post("/stock-universes/:id/members", controller.addMembers);
  router.delete("/stock-universes/:id/members/:symbol", controller.removeMember);

  return router;
}

module.exports = createStockUniversesRouter;
