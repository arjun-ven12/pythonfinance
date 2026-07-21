function createPaperExecutionService({
  appendOutput,
  appendPaperExecution,
  ensureLedgerInitialized,
  getPortfolioForUser,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  paperExecutionPath,
  prisma,
  pythonEngineDir,
  rebuildCaches,
  requireUserId,
  spawn,
  memoryIngestionService = null,
}) {
  function runPaperOrder(order, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        const ownerId = requireUserId(userId);
        const [portfolio, paperTrades] = await Promise.all([
          getPortfolioForUser(ownerId),
          prisma.run((db) =>
            db.paperTrade.findMany({
              where: { userId: ownerId },
              orderBy: { filledAt: "asc" },
              take: 1000,
            })
          ),
        ]);
        const child = spawn(
          getPythonPath(),
          [
            paperExecutionPath,
            "--user-id",
            ownerId,
            "--order-json",
            JSON.stringify(order),
            "--portfolio-json",
            JSON.stringify(portfolio.ledgerState || {}),
            "--paper-trades-json",
            JSON.stringify({ trades: paperTrades }),
          ],
          {
            cwd: pythonEngineDir,
            stdio: ["ignore", "pipe", "pipe"],
          }
        );
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          stderr = appendOutput(stderr, chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) {
            const error = new Error(
              getProcessFailureMessage("Paper execution failed", stderr)
            );
            error.details = { code, stdout, stderr };
            reject(error);
            return;
          }

          try {
            resolve(parseJsonOutput(stdout));
          } catch (error) {
            error.details = { stdout, stderr };
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function persistPaperExecutionResult(
    userId,
    approvalRequestId,
    paperResult,
    approvalUpdates = {},
    decisionNote = null
  ) {
    const ownerId = requireUserId(userId);
    const trade = paperResult?.trade;

    if (!paperResult?.filled || !trade) {
      throw new Error("Paper execution result does not contain a filled trade.");
    }

    return prisma.run((db) =>
      db.$transaction(async (transaction) => {
        const approval = await transaction.approvalRequest.findFirst({
          where: { id: approvalRequestId, userId: ownerId },
        });

        if (!approval) {
          const error = new Error("Approval request not found.");
          error.statusCode = 404;
          throw error;
        }

        if (approval.status === "EXECUTED") {
          const error = new Error("Approval request has already been executed.");
          error.statusCode = 409;
          throw error;
        }

        if (approval.status !== "APPROVED") {
          const error = new Error("Approval request must be APPROVED before paper execution.");
          error.statusCode = 409;
          throw error;
        }

        const cached = await transaction.portfolioState.findFirst({
          where: { userId: ownerId },
          orderBy: { updatedAt: "desc" },
        });
        await ensureLedgerInitialized(transaction, ownerId, cached?.stateJson);

        const paperTrade = await transaction.paperTrade.upsert({
          where: {
            userId_approvalRequestId: {
              userId: ownerId,
              approvalRequestId,
            },
          },
          update: {
            raw: paperResult,
          },
          create: {
            userId: ownerId,
            approvalRequestId,
            symbol: trade.symbol,
            side: trade.side,
            orderType: trade.order_type || trade.orderType || "MARKET",
            quantity: Number(trade.quantity),
            requestedPrice: trade.requested_price ?? trade.requestedPrice ?? null,
            fillPrice: Number(trade.fill_price ?? trade.fillPrice),
            fee: Number(trade.fee || 0),
            slippageBps: trade.slippage_bps ?? trade.slippageBps ?? null,
            status: "FILLED",
            filledAt: trade.filled_at ? new Date(trade.filled_at) : new Date(),
            raw: paperResult,
          },
        });

        const symbol = String(trade.symbol || "").toUpperCase();
        const beforePosition = cached?.stateJson?.positions?.[symbol];
        const beforeQuantity = Number(beforePosition?.quantity || 0);
        const beforeRealizedPnl = Number(cached?.stateJson?.realized_pnl || 0);
        await appendPaperExecution(transaction, ownerId, {
          trade,
          executionId: paperTrade.id,
          orderId: approvalRequestId,
          approvalId: approvalRequestId,
        });
        const strategyVersionId =
          approval.raw?.strategyVersionId ||
          approval.raw?.active_strategy_config?.strategyVersionId ||
          null;
        const matrixCellId =
          approval.raw?.matrixCellId ||
          approval.raw?.matrix_cell_id ||
          approval.raw?.active_strategy_config?.matrixCellId ||
          null;
        const brokerFillIds = Array.isArray(approvalUpdates.raw?.broker_fill_ids)
          ? approvalUpdates.raw.broker_fill_ids.filter(Boolean).slice(0, 20)
          : [];
        const rebuilt = await rebuildCaches(transaction, ownerId, cached?.stateJson, {
          trigger: "INTERNAL_PAPER_FILL",
          fillId: brokerFillIds[0] || paperTrade.id,
          tradeId: paperTrade.id,
          orderId: approvalRequestId,
          approvalId: approvalRequestId,
          strategyVersionId,
          matrixCellId,
          observedAfter: paperTrade.id,
          auditCritical: true,
          forceMemory: true,
        });
        if (memoryIngestionService) {
          const { internalPaperExecutionEvents, portfolioAllocationChangedEvent, portfolioOutcomeEvent } = require("../../memory/services/memoryEvents");
          const afterQuantity = Number(rebuilt.ledgerState?.positions?.[symbol]?.quantity || 0);
          const outcomeContext = {
            beforeState: cached?.stateJson || {},
            observedAfter: brokerFillIds.length ? "BROKER_FILL" : "INTERNAL_PAPER_FILL",
            associatedDecisionId: approvalRequestId,
            observationWindow: "IMMEDIATE_POST_FILL",
            orderId: approvalUpdates.raw?.broker_order_id || approvalRequestId,
            fillId: brokerFillIds[0] || paperTrade.id,
            fillIds: brokerFillIds,
            tradeId: paperTrade.id,
            approvalId: approvalRequestId,
            symbol,
            beforeQuantity,
            afterQuantity,
          };
          await memoryIngestionService.recordEvents(
            [
              ...internalPaperExecutionEvents(paperTrade, {
                beforeQuantity,
                afterQuantity,
                realizedPnlDelta: Number(rebuilt.ledgerState?.realized_pnl || 0) - beforeRealizedPnl,
                snapshotId: rebuilt.snapshot?.id,
                strategyVersionId,
                matrixCellId,
              }),
              portfolioAllocationChangedEvent(rebuilt.snapshot, outcomeContext),
              portfolioOutcomeEvent(rebuilt.snapshot, outcomeContext),
            ],
            { transaction, critical: true }
          );
        }

        const raw =
          approval.raw && typeof approval.raw === "object" ? approval.raw : {};
        const updated = await transaction.approvalRequest.update({
          where: { id: approval.id },
          data: {
            ...approvalUpdates,
            status: "EXECUTED",
            decidedAt: new Date(),
            decisionNote: decisionNote || approval.decisionNote || null,
            raw: {
              ...raw,
              ...(approvalUpdates.raw || {}),
              paper_trade_id: paperTrade.id,
              paper_execution: paperResult,
            },
          },
        });

        return {
          ...updated,
          paper_trade: paperTrade,
          paper_execution: paperResult,
        };
      })
    );
  }

  return {
    persistPaperExecutionResult,
    runPaperOrder,
  };
}

module.exports = createPaperExecutionService;
