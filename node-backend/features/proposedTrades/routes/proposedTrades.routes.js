const express = require("express");

function createProposedTradesRouter({
  proposedTradeToOrder,
  readProposedOrdersForApi,
  syncApprovalRequestsFromProposedOrders,
  syncProposedTradesFromJson,
  updateProposedTrade,
}) {
  const router = express.Router();

  router.get("/proposed-orders", async (req, res, next) => {
    try {
      await syncProposedTradesFromJson(req.user.id);
      res.json(await readProposedOrdersForApi(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  const updateHandler = async (req, res) => {
    try {
      const trade = await updateProposedTrade(
        req.params.id,
        req.body || {},
        req.user.id
      );
      await syncApprovalRequestsFromProposedOrders(req.user.id);
      res.json(proposedTradeToOrder(trade));
    } catch (error) {
      res.status(error.message.includes("not found") ? 404 : 400).json({
        error: error.message,
      });
    }
  };

  router.patch("/proposed-trades/:id", updateHandler);
  router.patch("/proposed-orders/:id", updateHandler);

  return router;
}

module.exports = createProposedTradesRouter;
