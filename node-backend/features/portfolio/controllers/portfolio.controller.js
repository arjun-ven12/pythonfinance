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
    portfolioCopilotService,
    portfolioAdvisorService,
    portfolioProposalService,
  } = deps;

  return {
    async listCopilotProposals(req, res) {
      try { res.json({ proposals: await portfolioProposalService.list(req.user.id) }); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async saveCopilotProposal(req, res) {
      try { res.status(201).json(await portfolioProposalService.save(req.user.id, req.body || {})); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async approveCopilotProposal(req, res) {
      try { res.json(await portfolioProposalService.approve(req.user.id, req.params.id, req.body?.reason)); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async rejectCopilotProposal(req, res) {
      try { res.json(await portfolioProposalService.reject(req.user.id, req.params.id, req.body?.reason)); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async recommendWithCopilot(req, res) {
      try { res.json(await portfolioAdvisorService.recommend(req.user.id, req.body || {})); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async simulateWithCopilot(req, res) {
      try { res.json(await portfolioAdvisorService.scenario(req.user.id, req.body || {})); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async compareWithCopilot(req, res) {
      try { res.json(await portfolioAdvisorService.compare(req.user.id, req.body || {})); }
      catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
    },

    async generateCopilotOverview(req, res) {
      try {
        res.json(await portfolioCopilotService.generateOverview(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

    async askCopilot(req, res) {
      try {
        res.json(await portfolioCopilotService.ask(req.user.id, req.body || {}));
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
      }
    },

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
