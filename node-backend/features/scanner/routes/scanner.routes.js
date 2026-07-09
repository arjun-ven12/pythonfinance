const express = require("express");

function createScansRouter({
  computeSignalChanges,
  normalizeRawOpportunity,
  normalizeStoredOpportunity,
  prisma,
  readScanResultsWithHistory,
  scanJobService,
  startScanJobForUser,
  storedScanSelect,
  validateSymbol,
  withJsonFallback,
  withPrismaSource,
}) {
  const router = express.Router();

  router.get("/scan-results", async (req, res) => {
    try {
      res.json(await readScanResultsWithHistory(req.user.id));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/scans/start", async (req, res) => {
    try {
      const job = await startScanJobForUser(req.user.id, req.body || {}, "MANUAL");
      res.status(202).json({ job });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.message,
        job: error.job ? scanJobService.serializeJob(error.job) : undefined,
      });
    }
  });

  router.get("/scans/active", async (req, res) => {
    try {
      res.json({ job: await scanJobService.getActiveJob(req.user.id) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/scans/:jobId", async (req, res) => {
    try {
      const job = await scanJobService.getJob(req.user.id, req.params.jobId);
      if (!job) {
        res.status(404).json({ error: "Scan job not found." });
        return;
      }
      res.json({ job });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/scans/:jobId/cancel", async (req, res) => {
    try {
      const job = await scanJobService.cancelJob(req.user.id, req.params.jobId);
      if (!job) {
        res.status(404).json({ error: "Scan job not found." });
        return;
      }
      res.json({ job });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/scans", async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, 100);
      const scans = await prisma.run((db) => db.scan.findMany({
        where: { userId: req.user.id },
        orderBy: {
          generatedAt: "desc",
        },
        take: limit,
        select: storedScanSelect,
      }));

      res.json(withPrismaSource({
        scans: scans.map((scan) => ({
          id: scan.id,
          generated_at: scan.generatedAt,
          market_regime: scan.marketRegime,
          risk_multiplier: scan.riskMultiplier,
          opportunity_count: scan.opportunities.length,
          buy_count: scan.opportunities.filter((item) => item.signal === "BUY").length,
          hold_count: scan.opportunities.filter((item) => item.signal === "HOLD").length,
          sell_count: scan.opportunities.filter((item) => item.signal === "SELL").length,
          top_opportunities: scan.opportunities
            .sort((a, b) => b.opportunityScore - a.opportunityScore)
            .slice(0, 5)
            .map((opportunity) => normalizeStoredOpportunity(opportunity, scan)),
        })),
      }));
    } catch (error) {
      res.json(withJsonFallback({
        scans: [],
      }, error));
    }
  });

  router.get("/opportunity-history/:symbol", async (req, res) => {
    const symbol = validateSymbol(req.params.symbol);

    try {
      const opportunities = await prisma.run((db) => db.opportunity.findMany({
        where: { userId: req.user.id, symbol },
        orderBy: {
          scan: {
            generatedAt: "asc",
          },
        },
        include: {
          scan: true,
        },
      }));

      res.json(withPrismaSource({
        symbol,
        history: opportunities.map((opportunity) =>
          normalizeStoredOpportunity(opportunity, opportunity.scan)
        ),
      }));
    } catch (error) {
      res.json(withJsonFallback({
        symbol,
        history: [],
      }, error));
    }
  });

  router.get("/signal-changes", async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);
      const scans = await prisma.run((db) => db.scan.findMany({
        where: { userId: req.user.id },
        orderBy: {
          generatedAt: "desc",
        },
        take: Math.max(limit, 25),
        select: storedScanSelect,
      }));

      res.json(withPrismaSource({
        changes: computeSignalChanges(scans).slice(0, limit),
      }));
    } catch (error) {
      res.json(withJsonFallback({
        changes: [],
      }, error));
    }
  });

  return router;
}

module.exports = createScansRouter;
