const prisma = require("./prisma");
const alertRepository = require("../repositories/alertRepository");
const alertDeliveryService = require("./alertDeliveryService");
const ledgerRepository = require("../repositories/transactionLedgerRepository");
const { saveScanResultsToDatabase } = require("./scanRepository");
const {
  persistValidationSignalsFromScanResults,
} = require("./validationService");
const { requireUserId } = require("../repositories/ownership");

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSide(value) {
  return String(value || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
}

async function persistAlerts({ userId, scanId, alerts = [] }) {

  if (!alerts.length) {
    return 0;
  }

  let persisted = 0;
  const newAlerts = [];

  await prisma.run(async (db) => {
    for (const alert of alerts) {
      const score = numberOrNull(alert.score ?? alert.opportunity_score) || 0;
      const confidence = numberOrNull(alert.confidence);
      if (score < 60) {
        continue;
      }

      const persistedAlert = await alertRepository.upsertAlert(userId, {
        ...alert,
        scanId,
        category: "SCANNER",
        source: "SCAN",
        severity: alertRepository.severityFromScore(score),
        title: `${String(alert.symbol || "").toUpperCase()} high-score BUY setup`,
        message:
          confidence == null
            ? `Opportunity score ${score} crossed the alert threshold.`
            : `Opportunity score ${score} with confidence ${confidence} crossed the alert threshold.`,
        score,
        confidence,
        backtestReturn: numberOrNull(alert.backtest_return),
        drawdown: numberOrNull(alert.drawdown),
        reasons: alert.reasons || [],
        metadata: {
          relatedScanId: scanId,
          alertRule: "BUY_SCORE_THRESHOLD",
          threshold: 60,
        },
        raw: alert,
      }, db);
      if (persistedAlert.occurrences === 1) {
        newAlerts.push(persistedAlert);
      }
      persisted += 1;
    }
  });

  for (const alert of newAlerts) {
    await alertDeliveryService.queueAlertDelivery(userId, alert).catch((error) => {
      console.error(`Alert delivery queue failed: ${error.message}`);
    });
  }
  await alertDeliveryService.processDueDeliveries(userId).catch((error) => {
    console.error(`Alert delivery processing failed: ${error.message}`);
  });

  return persisted;
}

function shouldCreateApproval(order, mode) {
  const route = order.execution_route?.route;

  if (mode === "MANUAL_APPROVAL") {
    return true;
  }

  if (mode === "SEMI_AUTOMATED") {
    return route === "REQUEST_APPROVAL" || route === "BLOCKED";
  }

  return route === "READY_FOR_AUTO_EXECUTION" || route === "BLOCKED";
}

async function persistProposalsAndApprovals({
  userId,
  proposed = { orders: [] },
  activeStrategy = null,
  scanId = null,
  memoryIngestionService = null,
}) {
  const orders = proposed.orders || [];
  const mode = ["MANUAL_APPROVAL", "SEMI_AUTOMATED", "FULL_AUTOMATION"].includes(
    proposed.mode
  )
    ? proposed.mode
    : "MANUAL_APPROVAL";
  let proposalCount = 0;
  let approvalCount = 0;
  const autoExecutionApprovalIds = [];

  for (const order of orders) {
    const symbol = String(order.symbol || "").trim().toUpperCase();
    const quantity = numberOrNull(order.quantity);
    const entryPrice = numberOrNull(order.entry_price ?? order.entryPrice);

    if (!symbol || !quantity || quantity <= 0 || !entryPrice || entryPrice <= 0) {
      continue;
    }
    const sourceOpportunity = scanId
      ? await prisma.run((db) => db.opportunity.findFirst({ where: { userId, scanId, symbol }, orderBy: { opportunityScore: "desc" } }))
      : null;

    const existing = await prisma.run((db) =>
      db.proposedTrade.findFirst({
        where: {
          userId,
          symbol,
          status: {
            in: ["PROPOSED", "PENDING_APPROVAL", "PENDING", "APPROVED"],
          },
        },
        orderBy: { createdAt: "desc" },
      })
    );
    let proposal = existing;

    if (!existing?.manualOverride) {
      const data = {
        symbol,
        side: normalizeSide(order.side),
        quantity,
        entryPrice,
        stopLoss: numberOrNull(order.stop_loss ?? order.stopLoss),
        takeProfit: numberOrNull(order.take_profit ?? order.takeProfit),
        confidence: numberOrNull(order.confidence),
        score: numberOrNull(order.score ?? order.opportunity_score),
        recommendation: order.recommendation || null,
        status: "PROPOSED",
        raw: {
          ...order,
          strategyVersionId: activeStrategy?.strategyVersionId || null,
          opportunityId: sourceOpportunity?.id || null,
          scanId,
          active_strategy_config: activeStrategy || null,
        },
      };
      proposal = await prisma.run(async (db) => {
        if (!existing) {
          return db.proposedTrade.create({
            data: {
              ...data,
              userId,
            },
          });
        }
        const updated = await db.proposedTrade.updateMany({
          where: { id: existing.id, userId },
          data,
        });
        if (updated.count !== 1) {
          throw new Error("Proposed trade ownership changed during scan save.");
        }
        return db.proposedTrade.findFirst({
          where: { id: existing.id, userId },
        });
      });
    }
    proposalCount += 1;

    if (!shouldCreateApproval(order, mode)) {
      continue;
    }

    const activeApproval = await prisma.run((db) =>
      db.approvalRequest.findFirst({
        where: {
          userId,
          symbol,
          status: { in: ["PENDING", "APPROVED", "SNOOZED"] },
        },
      })
    );

    if (!activeApproval) {
      const createdApproval = await prisma.run((db) =>
        db.$transaction(async (transaction) => {
          const request = await transaction.approvalRequest.create({
            data: {
            userId,
            symbol,
            side: normalizeSide(order.side),
            quantity: proposal.quantity,
            entryPrice: proposal.entryPrice,
            stopLoss: proposal.stopLoss,
            takeProfit: proposal.takeProfit,
            confidence: proposal.confidence,
            opportunityScore: proposal.score,
            riskLevel: order.risk_level || null,
            recommendation: order.recommendation || "PENDING_APPROVAL",
            approvalMode: mode,
            reason: order.reason || null,
            safetyViolationsJson: order.safety_violations || [],
            newsEventsJson: order.news_events || [],
            openaiReasoningJson: order.openai_reasoning || {},
            raw: {
              proposed_trade_id: proposal.id,
              source: "scan_persistence",
              strategyVersionId: activeStrategy?.strategyVersionId || null,
              opportunityId: sourceOpportunity?.id || null,
              scanId,
              active_strategy_config: activeStrategy || null,
              auto_execute_eligible:
                mode === "FULL_AUTOMATION" &&
                order.execution_route?.route === "READY_FOR_AUTO_EXECUTION",
              order,
            },
            },
          });
          await ledgerRepository.appendEvents(transaction, userId, [
            {
              eventType: "ORDER_CREATED",
              orderId: request.id,
              approvalId: request.id,
              symbol: request.symbol,
              quantity: request.quantity,
              price: request.entryPrice,
              metadata: {
                side: request.side,
                approvalMode: request.approvalMode,
                source: "SCAN_PERSISTENCE",
              },
            },
          ]);
          return request;
        })
      );
      if (memoryIngestionService) { const { approvalEvent } = require("../features/memory/services/memoryEvents"); await memoryIngestionService.recordEvent(approvalEvent(createdApproval, "APPROVAL_CREATED")); }
      approvalCount += 1;
      if (createdApproval.raw?.auto_execute_eligible) {
        autoExecutionApprovalIds.push(createdApproval.id);
      }
    }
  }

  return { proposalCount, approvalCount, autoExecutionApprovalIds };
}

async function persistCompletedScan({
  scanResults,
  userId,
  durationSeconds = null,
  source = "manual",
  startedAt = null,
  alerts = [],
  proposedOrders = { orders: [] },
  memoryIngestionService = null,
}) {
  const ownerId = requireUserId(userId);
  const started = startedAt ? new Date(startedAt) : new Date();
  const scan = await saveScanResultsToDatabase(scanResults, ownerId);
  await persistValidationSignalsFromScanResults(scanResults, ownerId);
  const activeStrategy =
    scanResults.active_strategy_config ||
    scanResults.active_strategy ||
    null;
  const alertCount = await persistAlerts({
    userId: ownerId,
    scanId: scan.id,
    alerts,
  });
  const { proposalCount, approvalCount, autoExecutionApprovalIds } =
    await persistProposalsAndApprovals({
      userId: ownerId,
      proposed: proposedOrders,
      activeStrategy,
      scanId: scan.id,
      memoryIngestionService,
    });
  const completedAt = new Date();
  const engineRun = await prisma.run((db) =>
    db.engineRun.create({
      data: {
        userId: ownerId,
        scanId: scan.id,
        status: "SUCCESS",
        startedAt: started,
        completedAt,
        durationSeconds: numberOrNull(durationSeconds),
        raw: {
          source,
          external_scan_id: scanResults.scan_id || null,
          alerts: alertCount,
          proposed_trades: proposalCount,
          approvals: approvalCount,
        },
      },
    })
  );
  await prisma.run(async (db) => {
    const currentEngineStatus = await db.engineStatus.findUnique({
      where: { userId: ownerId },
      select: { status: true },
    });
    const currentStatus = currentEngineStatus?.status || {};
    const status = {
      ...currentStatus,
      is_running:
        source === "scheduler"
          ? true
          : Boolean(currentStatus.is_running),
      last_run_at: completedAt.toISOString(),
      last_duration_seconds: numberOrNull(durationSeconds),
      last_error: null,
    };

    return db.engineStatus.upsert({
      where: { userId: ownerId },
      update: { status },
      create: { userId: ownerId, status },
    });
  });

  if (memoryIngestionService) {
    const { opportunityEvent, scanCompletedEvent } = require("../features/memory/services/memoryEvents");
    const threshold = Math.min(100, Math.max(0, Number(process.env.MEMORY_SCANNER_MIN_SCORE) || 70));
    const routedSymbols = new Set((proposedOrders.orders || []).map((order) => String(order.symbol || "").toUpperCase()));
    const opportunities = await prisma.run((db) => db.opportunity.findMany({
      where: { userId: ownerId, scanId: scan.id, OR: [{ opportunityScore: { gte: threshold } }, { symbol: { in: [...routedSymbols] } }] },
      orderBy: { opportunityScore: "desc" },
      take: 50,
    }));
    await memoryIngestionService.recordEvent(scanCompletedEvent({ ...scan, userId: ownerId }, { source, opportunityCount: scanResults.opportunities?.length || scanResults.results?.length || 0, alertCount, proposalCount, approvalCount, durationSeconds }));
    for (const opportunity of opportunities) {
      await memoryIngestionService.recordEvent(opportunityEvent(opportunity));
      if (routedSymbols.has(String(opportunity.symbol).toUpperCase())) {
        await memoryIngestionService.recordEvent(opportunityEvent(opportunity, "OPPORTUNITY_ROUTED", { reason: "Scanner proposal entered the approval or execution routing flow." }));
      }
    }
  }

  return {
    dataSource: "PRISMA",
    degradedMode: false,
    scanId: scan.id,
    engineRunId: engineRun.id,
    alertCount,
    proposalCount,
    approvalCount,
    autoExecutionApprovalIds,
  };
}

module.exports = {
  deliverTelegramAlerts: async (userId) =>
    alertDeliveryService.processDueDeliveries(userId),
  persistCompletedScan,
  persistProposalsAndApprovals,
  shouldCreateApproval,
};
