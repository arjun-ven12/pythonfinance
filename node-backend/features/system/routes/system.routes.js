const express = require("express");
const createSystemController = require("../controllers/system.controller");

function createSystemRouter(deps) {
  const router = express.Router();
  const controller = createSystemController(deps);

  router.get("/system/runtime", controller.getRuntime);

  return router;
}

module.exports = createSystemRouter;
