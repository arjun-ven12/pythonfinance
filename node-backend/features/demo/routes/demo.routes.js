const express = require("express");
const { getDemoMarketDataPayload, getDemoPayload } = require("../demoData");

function createDemoRouter() {
  const router = express.Router();

  router.get("/dashboard", (_req, res) => {
    res.json(getDemoPayload("dashboard"));
  });

  router.get("/scanner", (_req, res) => {
    res.json(getDemoPayload("scanner"));
  });

  router.get("/strategy-lab", (_req, res) => {
    res.json(getDemoPayload("strategyLab"));
  });

  router.get("/portfolio", (_req, res) => {
    res.json(getDemoPayload("portfolio"));
  });

  router.get("/validation", (_req, res) => {
    res.json(getDemoPayload("validation"));
  });

  router.get("/playbook", (_req, res) => {
    res.json(getDemoPayload("playbook"));
  });

  router.get("/approvals", (_req, res) => {
    res.json(getDemoPayload("approvals"));
  });

  router.get("/market-data/:symbol/quote", (req, res) => {
    const payload = getDemoMarketDataPayload(req.params.symbol, "5D");
    res.json(payload.payload);
  });

  router.get("/market-data/:symbol/price-history", (req, res) => {
    const payload = getDemoMarketDataPayload(req.params.symbol, req.query.range || "1M");
    res.json(payload.payload);
  });

  router.post("/reset-session", (_req, res) => {
    res.status(204).end();
  });

  return router;
}

module.exports = createDemoRouter;
