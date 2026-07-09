const express = require("express");
const { createBrokerController } = require("../controllers/broker.controller");

function createBrokerRouter(deps) {
  const router = express.Router();
  const controller = createBrokerController(deps);

  router.get("/ibkr/status", controller.getStatus);
  router.post("/ibkr/save-config", controller.saveConfig);
  router.post("/ibkr/test-connection", controller.testConnection);
  router.get("/broker/config", controller.getBrokerConfig);
  router.patch("/broker/config", controller.saveSelectedBrokerConfig);
  router.post("/broker/config", controller.saveSelectedBrokerConfig);
  router.post("/broker/test-connection", controller.testSelectedBrokerConnection);
  router.get("/broker/accounts", controller.getBrokerAccounts);
  router.get("/broker/secret-status", controller.getBrokerSecretStatus);
  router.post("/broker/secrets", controller.saveBrokerSecrets);
  router.post("/broker/sync", controller.synchronizeBrokerState);
  router.get("/broker/health", controller.getBrokerHealth);
  router.get("/broker/account", controller.getBrokerAccount);
  router.get("/broker/capabilities", controller.getBrokerCapabilities);
  router.get("/broker/reconciliation", controller.getBrokerReconciliation);
  router.post("/broker/reconciliation/sync-ledger", controller.syncBrokerLedger);
  router.get("/broker/logs", controller.getBrokerLogs);
  router.get("/broker/orders", controller.listBrokerOrders);
  router.get("/broker/fills", controller.listBrokerFills);
  router.get("/broker/preflight", controller.getBrokerPreflight);
  router.post("/broker/preview-order", controller.previewPaperOrder);
  router.post("/broker/execute-paper-order", controller.executePaperOrder);
  router.post("/broker/orders/:id/sync", controller.syncBrokerOrder);
  router.post("/broker/orders/:id/mark-cancelled", controller.markBrokerOrderCancelled);
  router.post("/broker/orders/import", controller.importBrokerOrder);
  router.post("/broker/orders/:id/cancel", controller.cancelBrokerOrder);
  router.post("/broker/place-order", controller.placeBrokerOrder);
  router.post("/broker/preview-manual-order", controller.previewManualBrokerOrder);
  router.post("/broker/workspace-order/cancel", controller.cancelWorkspaceOrder);
  router.post("/broker/workspace-order/modify", controller.modifyWorkspaceOrder);
  router.get("/broker/workspace-order/status", controller.getWorkspaceOrderStatus);
  router.get("/broker/workspace-order/executions", controller.getWorkspaceExecutions);

  return router;
}

module.exports = createBrokerRouter;
