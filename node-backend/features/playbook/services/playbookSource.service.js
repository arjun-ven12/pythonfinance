function createPlaybookSourceService({
  computeSignalChanges,
  exportPlaybook,
  getDefaultExecutionSettings,
  getPlaybookDashboard,
  getPortfolioForUser,
  listApprovalRequests,
  prisma,
  readAlertsForApi,
  readProposedOrdersForApi,
  readScanResultsWithHistory,
  readUserSetting,
  recordPlaybookExport,
  storedScanWithOpportunitiesSelect,
}) {
  async function getApprovalRequestsForPlaybook(userId) {
    try {
      return await listApprovalRequests(userId);
    } catch (_error) {
      return [];
    }
  }

  async function getSignalChangesForPlaybook(userId) {
    try {
      const scans = await prisma.run((db) => db.scan.findMany({
        where: { userId },
        orderBy: {
          generatedAt: "desc",
        },
        take: 100,
        select: storedScanWithOpportunitiesSelect,
      }));

      return computeSignalChanges(scans).slice(0, 200);
    } catch (_error) {
      return [];
    }
  }

  async function getPlaybookSourceData(userId) {
    const [
      scanResults,
      portfolioResult,
      paperTrades,
      proposedOrders,
      safetySettings,
      alerts,
      executionSettings,
      approvalRequests,
      signalChanges,
    ] = await Promise.all([
      readScanResultsWithHistory(userId),
      getPortfolioForUser(userId),
      prisma.run((db) =>
        db.paperTrade.findMany({
          where: { userId },
          orderBy: { filledAt: "desc" },
          take: 500,
        })
      ),
      readProposedOrdersForApi(userId),
      prisma.run((db) => db.safetySettings.findUnique({ where: { userId } })),
      readAlertsForApi(userId),
      readUserSetting(userId, "execution_settings", getDefaultExecutionSettings()),
      getApprovalRequestsForPlaybook(userId),
      getSignalChangesForPlaybook(userId),
    ]);

    return {
      scanResults,
      paperPortfolio: portfolioResult.ledgerState,
      paperTrades: { trades: paperTrades },
      proposedOrders,
      safetyStatus: safetySettings?.settings || {
        violations: [],
        limits: {},
      },
      alerts,
      executionSettings,
      approvalRequests,
      signalChanges,
      riskDashboard: null,
      sources: {
        scan_results: scanResults.dataSource,
        paper_portfolio: "PRISMA",
        paper_trades: "PRISMA",
        proposed_orders: proposedOrders.dataSource,
        safety_status: "PRISMA",
        alerts: alerts.dataSource,
        execution_settings: "PRISMA",
      },
    };
  }

  async function sendPlaybookExport(req, res, playbookId) {
    const format = String(req.query.format || "json").toLowerCase();
    const normalizedFormat = ["json", "csv", "markdown"].includes(format)
      ? format
      : "json";
    const dashboard = await getPlaybookDashboard(
      req.user.id,
      await getPlaybookSourceData(req.user.id),
      playbookId
    );
    const exported = exportPlaybook(dashboard, normalizedFormat);

    if (dashboard.playbook?.id && dashboard.playbook.id !== "json-fallback") {
      await recordPlaybookExport(
        req.user.id,
        dashboard.playbook.id,
        exported,
        normalizedFormat,
        {
          requested_route: req.originalUrl,
          fallback: dashboard.fallback,
          run_count: dashboard.recent_runs?.length || 0,
          snapshot_count: dashboard.snapshots?.length || 0,
          insight_count: dashboard.insights?.length || 0,
        }
      );
    }

    res.setHeader("Content-Type", exported.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    res.send(exported.body);
  }

  return {
    getPlaybookSourceData,
    sendPlaybookExport,
  };
}

module.exports = createPlaybookSourceService;
