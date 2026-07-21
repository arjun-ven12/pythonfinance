function createAutonomousPaperTradingService({
  getDefaultExecutionSettings,
  getRequestOrderPayload,
  persistPaperExecutionResult,
  prisma,
  readUserSetting,
  runPaperOrder,
  runPreTradeAnalysis,
  transitionApprovalRequest,
}) {
  function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function analysisUpdates(analysis) {
    return {
      preTradeAnalysisJson: analysis,
      safetyViolationsJson: analysis.safety_violations || [],
      newsEventsJson: analysis.upcoming_events || [],
      openaiReasoningJson: analysis.news_reasoning || {},
      riskLevel: analysis.risk_level || null,
      recommendation: analysis.recommendation || null,
    };
  }

  async function recordAttempt(userId, approval, details) {
    await prisma.run(async (db) => {
      const current = await db.approvalRequest.findFirst({
        where: { id: approval.id, userId },
        select: { raw: true },
      });
      const raw = current?.raw && typeof current.raw === "object" ? current.raw : {};
      return db.approvalRequest.updateMany({
        where: { id: approval.id, userId },
        data: {
          raw: {
            ...raw,
            auto_execution: {
              ...(raw.auto_execution || {}),
              ...details,
              updated_at: new Date().toISOString(),
            },
          },
        },
      });
    });
  }

  async function processEligibleApprovals({ userId }) {
    const settings = await readUserSetting(
      userId,
      "execution_settings",
      getDefaultExecutionSettings()
    );
    if (settings.execution_mode !== "FULL_AUTOMATION") {
      return { attempted: 0, executed: 0, blocked: 0, failed: 0, skipped: 0 };
    }

    const maxPerCycle = positiveInteger(settings.max_auto_trades_per_cycle, 5);
    const maxPerDay = positiveInteger(settings.max_auto_trades_per_day, 20);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const executedToday = await prisma.run((db) =>
      db.paperTrade.count({
        where: { userId, filledAt: { gte: startOfDay } },
      })
    );
    const remainingToday = Math.max(0, maxPerDay - executedToday);
    if (remainingToday === 0) {
      return { attempted: 0, executed: 0, blocked: 0, failed: 0, skipped: 0, policyLimitReached: true };
    }

    const candidates = await prisma.run((db) =>
      db.approvalRequest.findMany({
        where: {
          userId,
          approvalMode: "FULL_AUTOMATION",
          status: { in: ["PENDING", "APPROVED"] },
          raw: { path: ["auto_execute_eligible"], equals: true },
        },
        orderBy: { createdAt: "asc" },
        take: Math.min(maxPerCycle, remainingToday),
      })
    );
    const summary = { attempted: 0, executed: 0, blocked: 0, failed: 0, skipped: 0 };

    for (const candidate of candidates) {
      const route = candidate.raw?.order?.execution_route?.route;
      if (!candidate.raw?.auto_execute_eligible || route !== "READY_FOR_AUTO_EXECUTION") {
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;
      try {
        const analysis = await runPreTradeAnalysis(userId, {
          symbol: candidate.symbol,
          side: candidate.side,
          quantity: candidate.quantity,
          entryPrice: candidate.entryPrice,
          stopLoss: candidate.stopLoss,
          takeProfit: candidate.takeProfit,
          simulationMode: true,
        });

        if (!analysis.allow_trade || analysis.recommendation === "REJECT") {
          if (candidate.status === "PENDING") {
            await transitionApprovalRequest({
              id: candidate.id,
              userId,
              toStatus: "REJECTED",
              decisionNote: `Autonomous paper execution blocked by fresh pre-trade analysis: ${analysis.explanation || analysis.safety_violations?.[0] || "trade not allowed"}`,
              updates: analysisUpdates(analysis),
            });
          } else {
            await recordAttempt(userId, candidate, {
              status: "BLOCKED_AFTER_APPROVAL",
              reason: analysis.explanation || analysis.safety_violations?.[0] || "trade not allowed",
            });
          }
          summary.blocked += 1;
          continue;
        }

        let approved = candidate;
        if (candidate.status === "PENDING") {
          approved = await transitionApprovalRequest({
            id: candidate.id,
            userId,
            toStatus: "APPROVED",
            decisionNote: "Approved automatically by the configured FULL_AUTOMATION paper-trading policy after fresh pre-trade validation.",
            updates: analysisUpdates(analysis),
          });
        }

        const result = await runPaperOrder(getRequestOrderPayload(approved), userId);
        if (!result?.filled) {
          await recordAttempt(userId, approved, { status: "NOT_FILLED" });
          summary.failed += 1;
          continue;
        }
        await persistPaperExecutionResult(
          userId,
          approved.id,
          result,
          {
            ...analysisUpdates(analysis),
            raw: {
              auto_execution: {
                status: "EXECUTED",
                policy: "FULL_AUTOMATION_INTERNAL_PAPER",
                executed_at: new Date().toISOString(),
              },
            },
          },
          approved.decisionNote || "Executed automatically in the internal paper ledger."
        );
        summary.executed += 1;
      } catch (error) {
        await recordAttempt(userId, candidate, {
          status: "FAILED",
          error: String(error.message || error).slice(0, 1000),
        }).catch(() => {});
        summary.failed += 1;
      }
    }

    return summary;
  }

  return { processEligibleApprovals };
}

module.exports = createAutonomousPaperTradingService;
