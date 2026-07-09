const express = require("express");
const { createAdminController } = require("../controllers/admin.controller");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function createAdminRouter(deps) {
  const router = express.Router();
  const controller = createAdminController(deps);

  router.get("/admin/users", asyncHandler(controller.listUsers));
  router.patch("/admin/users/:id/verify", asyncHandler(controller.verifyUser));
  router.patch("/admin/users/:id/reject", asyncHandler(controller.rejectUser));
  router.patch("/admin/users/:id/suspend", asyncHandler(controller.suspendUser));
  router.patch("/admin/users/:id/role", asyncHandler(controller.updateRole));
  router.get("/admin/users/:id/page-access", asyncHandler(controller.getPageAccess));
  router.patch("/admin/users/:id/page-access", asyncHandler(controller.updatePageAccess));
  router.get("/admin/audit-logs", asyncHandler(controller.listAuditLogs));
  router.get("/admin/market-data-metrics", asyncHandler(controller.getMarketDataMetrics));

  return router;
}

module.exports = createAdminRouter;
