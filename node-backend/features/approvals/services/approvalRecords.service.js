function createApprovalRecordsService({
  ledgerRepository,
  normalizeExecutionMode,
  prisma,
  requireUserId,
  validateSymbol,
  memoryIngestionService = null,
}) {
  const allowedApprovalStatuses = new Set([
    "PENDING",
    "APPROVED",
    "REJECTED",
    "SNOOZED",
    "EXECUTED",
  ]);

  function parseRequiredTradeNumber(value, fieldName) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(fieldName + " must be greater than 0.");
    }
    return parsed;
  }

function normalizeApprovalStatus(value, fallback = "PENDING") {
  const status = String(value || fallback).trim().toUpperCase();
  return allowedApprovalStatuses.has(status) ? status : fallback;
}

function normalizeApprovalMode(value) {
  return normalizeExecutionMode(value);
}

function toNullableNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDecisionNote(body = {}) {
  return String(body.decisionNote ?? body.decision_note ?? body.note ?? "").trim();
}

function extractStrategyVersionId(order = {}, preTrade = null) {
  return (
    order.strategyVersionId ||
    order.strategy_version_id ||
    order.strategyConfig?.strategyVersionId ||
    order.strategyConfig?.strategy_version_id ||
    order.strategy_config?.strategyVersionId ||
    order.strategy_config?.strategy_version_id ||
    order.active_strategy?.strategyVersionId ||
    order.active_strategy?.strategy_version_id ||
    order.active_strategy_config?.strategyVersionId ||
    order.active_strategy_config?.strategy_version_id ||
    order.latest_scan?.strategyVersionId ||
    order.latest_scan?.strategy_version_id ||
    order.latest_scan?.raw?.strategyVersionId ||
    order.latest_scan?.raw?.strategy_version_id ||
    order.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    order.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    order.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    order.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    order.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    order.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    preTrade?.strategyVersionId ||
    preTrade?.strategy_version_id ||
    preTrade?.strategy?.versionId ||
    preTrade?.strategy?.strategyVersionId ||
    preTrade?.latest_scan?.strategyVersionId ||
    preTrade?.latest_scan?.strategy_version_id ||
    preTrade?.latest_scan?.raw?.strategyVersionId ||
    preTrade?.latest_scan?.raw?.strategy_version_id ||
    preTrade?.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    preTrade?.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    preTrade?.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    preTrade?.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    preTrade?.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    preTrade?.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    preTrade?.strategy_config?.strategyVersionId ||
    preTrade?.strategy_config?.strategy_version_id ||
    preTrade?.active_strategy_config?.strategyVersionId ||
    preTrade?.active_strategy_config?.strategy_version_id ||
    null
  );
}

function getRequestOrderPayload(request) {
  return {
    symbol: request.symbol,
    side: request.side || "BUY",
    orderType: "MARKET",
    order_type: "MARKET",
    timeInForce: "DAY",
    time_in_force: "DAY",
    quantity: Number(request.quantity),
    entry_price: Number(request.entryPrice),
    current_price: Number(request.entryPrice),
    limitPrice: Number(request.entryPrice),
    limit_price: Number(request.entryPrice),
    source: "approval_workflow",
    approval_request_id: request.id,
  };
}

function buildApprovalRequestData(body = {}) {
  const order = body.order || body;
  const preTrade = body.preTradeAnalysisJson || body.pre_trade_analysis_json || null;
  const strategyVersionId = extractStrategyVersionId(order, preTrade);
  const activeStrategyConfig =
    order.active_strategy_config ||
    order.activeStrategyConfig ||
    order.latest_scan?.raw?.active_strategy_config ||
    order.latest_scan?.raw?.strategy_config ||
    preTrade?.active_strategy_config ||
    preTrade?.activeStrategyConfig ||
    preTrade?.latest_scan?.raw?.active_strategy_config ||
    preTrade?.latest_scan?.raw?.strategy_config ||
    null;
  const strategyAudit = {
    strategy_name:
      order.strategy_name ||
      order.strategyName ||
      preTrade?.strategy_name ||
      preTrade?.strategy?.name ||
      null,
    strategy_source:
      order.strategy_source ||
      order.strategySource ||
      preTrade?.strategy_source ||
      preTrade?.strategy?.source ||
      null,
    strategy_config:
      order.strategy_config ||
      order.strategyConfig ||
      preTrade?.strategy_config ||
      preTrade?.strategy?.settings ||
      null,
    suggestion_basis:
      order.suggestion_basis ||
      order.suggestionBasis ||
      preTrade?.suggestion_basis ||
      null,
    strategyVersionId,
    strategy_version_id: strategyVersionId,
  };
  const hasStrategyAudit = Object.values(strategyAudit).some((value) => value);
  const preTradeWithStrategy =
    preTrade || hasStrategyAudit
      ? {
          ...(preTrade || {}),
          strategy_name: strategyAudit.strategy_name,
          strategy_source: strategyAudit.strategy_source,
          strategy_config: strategyAudit.strategy_config,
          suggestion_basis: strategyAudit.suggestion_basis,
          strategyVersionId,
          strategy_version_id: strategyVersionId,
          active_strategy_config: activeStrategyConfig,
          strategy: {
            ...(preTrade?.strategy || {}),
            versionId:
              preTrade?.strategy?.versionId ||
              preTrade?.strategy?.strategyVersionId ||
              strategyVersionId,
            strategyVersionId:
              preTrade?.strategy?.strategyVersionId ||
              preTrade?.strategy?.versionId ||
              strategyVersionId,
          },
        }
      : preTrade;
  const symbol = validateSymbol(order.symbol);
  const side = String(order.side || "BUY").trim().toUpperCase();
  const quantity = toNullableNumber(order.quantity);
  const entryPrice = toNullableNumber(order.entryPrice ?? order.entry_price);
  const stopLoss = toNullableNumber(order.stopLoss ?? order.stop_loss);
  const takeProfit = toNullableNumber(order.takeProfit ?? order.take_profit);

  if (!["BUY", "SELL"].includes(side)) {
    throw new Error("Side must be BUY or SELL.");
  }

  if (!quantity || quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  if (!entryPrice || entryPrice <= 0) {
    throw new Error("Entry price must be greater than 0.");
  }

  if (!stopLoss || stopLoss <= 0) {
    throw new Error("Stop loss must be greater than 0.");
  }

  if (!takeProfit || takeProfit <= 0) {
    throw new Error("Take profit must be greater than 0.");
  }

  return {
    symbol,
    side,
    quantity,
    entryPrice,
    stopLoss,
    takeProfit,
    confidence: toNullableNumber(order.confidence),
    opportunityScore: toNullableNumber(
      order.opportunityScore ?? order.opportunity_score
    ),
    riskLevel: order.riskLevel ?? order.risk_level ?? preTrade?.risk_level ?? null,
    recommendation:
      order.recommendation ?? preTrade?.recommendation ?? order.execution_route?.route ?? null,
    status: normalizeApprovalStatus(
      order.high_risk_flag ? "PENDING" : order.status,
      "PENDING"
    ),
    approvalMode: normalizeApprovalMode(
      order.approvalMode ?? order.approval_mode ?? order.execution_route?.mode
    ),
    reason:
      String(
        order.reason ||
          (order.execution_route?.approval_reasons || []).join("; ") ||
          ""
      ).trim() || null,
    preTradeAnalysisJson: preTradeWithStrategy,
    safetyViolationsJson:
      body.safetyViolationsJson ??
      body.safety_violations_json ??
      order.safety_violations ??
      preTrade?.safety_violations ??
      [],
    newsEventsJson:
      body.newsEventsJson ??
      body.news_events_json ??
      order.news_events ??
      preTrade?.upcoming_events ??
      [],
    openaiReasoningJson:
      body.openaiReasoningJson ??
      body.openai_reasoning_json ??
      order.openai_reasoning ??
      preTrade?.news_reasoning ??
      {},
    decisionNote: getDecisionNote(body) || null,
    raw: {
      ...body,
      strategyVersionId,
      strategy_version_id: strategyVersionId,
      active_strategy_config: activeStrategyConfig,
      strategy_audit: strategyAudit,
      high_risk_flag: Boolean(order.high_risk_flag),
      high_risk_warnings: order.high_risk_warnings || [],
    },
  };
}

function buildApprovalTradeEditData(existingRequest, body = {}) {
  if (!existingRequest) {
    throw new Error("Approval request not found.");
  }

  const currentStatus = normalizeApprovalStatus(existingRequest.status);

  if (["EXECUTED", "REJECTED"].includes(currentStatus)) {
    throw new Error("Executed or rejected approval requests cannot be edited.");
  }

  const editableFields = [
    ["quantity", "quantity"],
    ["entryPrice", "entry_price"],
    ["stopLoss", "stop_loss"],
    ["takeProfit", "take_profit"],
  ];
  const updates = {};
  const previous = {};
  const next = {};

  editableFields.forEach(([fieldName, snakeName]) => {
    const rawValue = body[fieldName] ?? body[snakeName];

    if (rawValue === undefined) {
      return;
    }

    const value = parseRequiredTradeNumber(rawValue, fieldName);
    updates[fieldName] = value;
    previous[fieldName] = existingRequest[fieldName];
    next[fieldName] = value;
  });

  if (Object.keys(updates).length === 0) {
    throw new Error("No editable trade fields were provided.");
  }

  const now = new Date().toISOString();
  const raw = existingRequest.raw && typeof existingRequest.raw === "object"
    ? existingRequest.raw
    : {};
  const manualEdits = Array.isArray(raw.manual_edits) ? raw.manual_edits : [];
  const note = getDecisionNote(body);

  return {
    ...updates,
    status: currentStatus === "APPROVED" ? "PENDING" : currentStatus,
    decidedAt: currentStatus === "APPROVED" ? null : existingRequest.decidedAt,
    decisionNote: note || existingRequest.decisionNote || null,
    raw: {
      ...raw,
      manual_edit: {
        edited_at: now,
        source: "dashboard",
        previous,
        updated: next,
        note: note || null,
      },
      manual_edits: [
        ...manualEdits,
        {
          edited_at: now,
          source: "dashboard",
          previous,
          updated: next,
          note: note || null,
        },
      ],
    },
  };
}

async function createApprovalRequestRecord(data, userId) {
  const ownerId = requireUserId(userId);
  try {
    const request = await prisma.run((db) =>
      db.$transaction(async (transaction) => {
        const request = await transaction.approvalRequest.create({
          data: {
            ...data,
            userId: ownerId,
          },
        });
        await ledgerRepository.appendEvents(transaction, ownerId, [
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
              source: "APPROVAL_REQUEST",
            },
          },
        ]);
        return request;
      })
    );
    if (memoryIngestionService) { const { approvalEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordEvent(approvalEvent(request, "APPROVAL_CREATED")); }
    return request;
  } catch (error) {
    throw new Error(`Approval request database create failed: ${error.message}`);
  }
}

async function listApprovalRequests(userId) {
  const ownerId = requireUserId(userId);
  try {
    return await prisma.run((db) => db.approvalRequest.findMany({
      where: { userId: ownerId },
      orderBy: {
        createdAt: "desc",
      },
    }));
  } catch (error) {
    throw new Error(`Approval request database read failed: ${error.message}`);
  }
}

async function getApprovalRequestById(id, userId) {
  const ownerId = requireUserId(userId);
  try {
    const request = await prisma.run((db) => db.approvalRequest.findFirst({
      where: {
        id,
        userId: ownerId,
      },
    }));

    if (request) {
      return request;
    }
  } catch (error) {
    throw new Error(`Approval request database lookup failed: ${error.message}`);
  }

  return null;
}

async function updateApprovalRequestRecord(id, updates, userId) {
  const ownerId = requireUserId(userId);
  try {
    return await prisma.run(async (db) => {
      const result = await db.approvalRequest.updateMany({
        where: {
          id,
          userId: ownerId,
        },
        data: updates,
      });

      if (result.count !== 1) {
        throw new Error("Approval request not found.");
      }

      const updated = await db.approvalRequest.findFirst({
        where: {
          id,
          userId: ownerId,
        },
      });
      if (memoryIngestionService && ["APPROVED", "REJECTED"].includes(updated?.status)) {
        const { approvalEvent } = require("../../memory/services/memoryEvents");
        await memoryIngestionService.recordEvent(approvalEvent(updated, updated.status === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED"));
        const opportunityId = updated.raw?.opportunityId || updated.raw?.opportunity_id;
        if (opportunityId) {
          const opportunity = await prisma.run((db) => db.opportunity.findFirst({ where: { id: opportunityId, userId: ownerId } }));
          if (opportunity) {
            const { opportunityEvent } = require("../../memory/services/memoryEvents");
            await memoryIngestionService.recordEvent(opportunityEvent(opportunity, updated.status === "APPROVED" ? "OPPORTUNITY_APPROVED" : "OPPORTUNITY_REJECTED", { reason: updated.decisionNote || `Approval ${updated.status.toLowerCase()}.` }));
          }
        }
      }
      return updated;
    });
  } catch (error) {
    throw new Error(`Approval request database update failed: ${error.message}`);
  }
}



  return {
    buildApprovalRequestData,
    buildApprovalTradeEditData,
    createApprovalRequestRecord,
    getApprovalRequestById,
    getDecisionNote,
    getRequestOrderPayload,
    listApprovalRequests,
    normalizeApprovalMode,
    normalizeApprovalStatus,
    toNullableNumber,
    updateApprovalRequestRecord,
  };
}

module.exports = createApprovalRecordsService;
