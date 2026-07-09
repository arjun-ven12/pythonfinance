const express = require("express");
const createPaperExecutionController = require("../controllers/paperExecution.controller");

function createPaperExecutionRouter(deps) {
  const router = express.Router();
  const controller = createPaperExecutionController(deps);

  router.post("/paper-orders", controller.executePaperOrder);

  return router;
}

module.exports = createPaperExecutionRouter;
