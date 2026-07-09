function createPortfolioController(deps) {
  const {
    buildPortfolioConstruction,
    buildRiskDashboardFromDatabase,
    getPortfolioForUser,
    ledgerRepository,
    prisma,
    rebuildPortfolioFromLedger,
    syncProposedTradesFromJson,
    tradeRepository,
    withJsonFallback,
    verifyUserLedger,
    withPrismaSource,
  } = deps;

  return {
    async getRiskDashboard(req, res) {
      try {
        await syncProposedTradesFromJson(req.user.id);
        res.json(await buildRiskDashboardFromDatabase(req.user.id));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getPortfolioConstruction(req, res) {
      try {
        res.json(
          buildPortfolioConstruction(
            await buildRiskDashboardFromDatabase(req.user.id)
          )
        );
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getPaperPortfolio(req, res) {
      try {
        const { ledgerState } = await getPortfolioForUser(req.user.id);
        res.json(withPrismaSource(ledgerState));
      } catch (error) {
        res.json(
          withJsonFallback(
            { equity: 0, cash: 0, positions: [], equity_history: [] },
            error
          )
        );
      }
    },

    async getPortfolioReconciliation(req, res) {
      try {
        const { reconciliation, integrity } = await getPortfolioForUser(req.user.id);
        res.json(withPrismaSource({
          status: reconciliation.status,
          matched: reconciliation.matched,
          ledgerVerified: integrity.valid,
          cashDifference: Number(reconciliation.cashDifference),
          positionDifference: reconciliation.positionDifference,
          mismatchAmount: Number(reconciliation.mismatchAmount),
          missingEvents: reconciliation.missingEvents,
          repairAction: reconciliation.repairAction,
          lastChecked: reconciliation.lastChecked,
          lastVerified: reconciliation.matched
            ? reconciliation.lastChecked
            : null,
        }));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async recomputePortfolio(req, res) {
      try {
        const { ledgerState, reconciliation } =
          await rebuildPortfolioFromLedger(req.user.id);
        res.json(withPrismaSource({
          status: "REBUILT",
          portfolio: ledgerState,
          reconciliation: {
            status: reconciliation.status,
            matched: reconciliation.matched,
            ledgerVerified: true,
            cashDifference: Number(reconciliation.cashDifference),
            positionDifference: reconciliation.positionDifference,
            mismatchAmount: Number(reconciliation.mismatchAmount),
            missingEvents: reconciliation.missingEvents,
            repairAction: reconciliation.repairAction,
            lastChecked: reconciliation.lastChecked,
            lastVerified: reconciliation.lastChecked,
          },
        }));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async getPaperLedgerIntegrity(req, res) {
      try {
        res.json(await verifyUserLedger(req.user.id));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getPaperTrades(req, res) {
      try {
        const trades = await tradeRepository.list(req.user.id, {
          source: { startsWith: "paper-approval:" },
        });
        res.json(withPrismaSource({
          generated_at: trades[0]?.updatedAt || null,
          trades,
        }));
      } catch (error) {
        res.json(withJsonFallback({ generated_at: null, trades: [] }, error));
      }
    },
  };
}

module.exports = { createPortfolioController };
