const express = require("express");

function createTradingRouter({ tradingSessionService }) {
  const router = express.Router();

  router.get("/trading/session", async (req, res) => {
    try {
      const session = await tradingSessionService.getTradingSession(req.user.id, {
        forceRefresh: req.query.refresh === "1",
      });
      res.json({ session });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createTradingRouter;
