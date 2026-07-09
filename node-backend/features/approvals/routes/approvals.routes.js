const express = require("express");
const { createApprovalsController } = require("../controllers/approvals.controller");

function transitionTo(status) {
  return (req, _res, next) => {
    req.toStatus = status;
    next();
  };
}

function createApprovalsRouter(deps) {
  const router = express.Router();
  const controller = createApprovalsController(deps);

  router.get("/approval-requests", controller.listApprovalRequests);
  router.get("/approval-requests/:id", controller.getApprovalRequest);
  router.post("/approval-requests", controller.createApprovalRequest);
  router.patch("/approval-requests/:id", controller.updateApprovalRequest);
  router.post("/approval-requests/:id/approve", transitionTo("APPROVED"), controller.transition);
  router.post("/approval-requests/:id/reject", transitionTo("REJECTED"), controller.transition);
  router.post("/approval-requests/:id/snooze", transitionTo("SNOOZED"), controller.transition);
  router.post("/approval-requests/:id/resume", transitionTo("PENDING"), controller.transition);
  router.post("/approval-requests/:id/execute-paper", controller.executePaper);
  router.post("/approval-requests/:id/execute-broker-paper", controller.executeBrokerPaper);
  router.post("/approval-requests/:id/execute-ibkr-paper", controller.executeBrokerPaper);

  return router;
}

module.exports = createApprovalsRouter;
