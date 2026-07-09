function createProposedTradesService({
  buildApprovalRequestData,
  createApprovalRequestRecord,
  getOrderEntry,
  getOrderQuantity,
  getOrderStop,
  normalizeApprovalMode,
  prisma,
  proposedTradeRepository,
  requireUserId,
  updateApprovalRequestRecord,
  validateSymbol,
  withJsonFallback,
  withPrismaSource,
}) {
  function parseRequiredTradeNumber(value, fieldName) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(fieldName + " must be greater than 0.");
    }
    return parsed;
  }

  function toNullableNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

function normalizeProposedTradeStatus(value, fallback = "PROPOSED") {
  return String(value || fallback).trim().toUpperCase();
}

function normalizeProposedTradeData(order = {}) {
  const symbol = validateSymbol(order.symbol);
  const side = String(order.side || "BUY").trim().toUpperCase();

  if (!["BUY", "SELL"].includes(side)) {
    throw new Error("Side must be BUY or SELL.");
  }

  const quantity = parseRequiredTradeNumber(order.quantity, "quantity");
  const entryPrice = parseRequiredTradeNumber(
    order.entryPrice ?? order.entry_price ?? order.current_price ?? order.price,
    "entry price"
  );
  const stopLoss = order.stopLoss ?? order.stop_loss ?? order.stop;
  const takeProfit = order.takeProfit ?? order.take_profit ?? order.target;
  const parsedStopLoss =
    stopLoss === undefined || stopLoss === null || stopLoss === ""
      ? null
      : parseRequiredTradeNumber(stopLoss, "stop loss");
  const parsedTakeProfit =
    takeProfit === undefined || takeProfit === null || takeProfit === ""
      ? null
      : parseRequiredTradeNumber(takeProfit, "take profit");

  if (side === "BUY" && parsedStopLoss !== null && parsedStopLoss >= entryPrice) {
    throw new Error("Stop loss must be below entry price for BUY trades.");
  }

  if (side === "BUY" && parsedTakeProfit !== null && parsedTakeProfit <= entryPrice) {
    throw new Error("Take profit must be above entry price for BUY trades.");
  }

  if (side === "SELL" && parsedStopLoss !== null && parsedStopLoss <= entryPrice) {
    throw new Error("Stop loss must be above entry price for SELL trades.");
  }

  if (side === "SELL" && parsedTakeProfit !== null && parsedTakeProfit >= entryPrice) {
    throw new Error("Take profit must be below entry price for SELL trades.");
  }

  return {
    symbol,
    side,
    quantity,
    entryPrice,
    stopLoss: parsedStopLoss,
    takeProfit: parsedTakeProfit,
    confidence: toNullableNumber(order.confidence),
    score: toNullableNumber(order.score ?? order.opportunityScore ?? order.opportunity_score),
    recommendation:
      order.recommendation ?? order.execution_route?.route ?? order.reason ?? null,
    status: normalizeProposedTradeStatus(order.status),
    notes: order.notes ?? order.note ?? null,
    raw: order,
  };
}

function proposedTradeToOrder(trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    entry_price: trade.entryPrice,
    entryPrice: trade.entryPrice,
    current_price: trade.entryPrice,
    stop_loss: trade.stopLoss,
    stopLoss: trade.stopLoss,
    take_profit: trade.takeProfit,
    takeProfit: trade.takeProfit,
    confidence: trade.confidence,
    score: trade.score,
    opportunity_score: trade.score,
    recommendation: trade.recommendation,
    status: trade.status,
    notes: trade.notes,
    manualOverride: trade.manualOverride,
    audit_events: trade.auditEvents || [],
    raw: trade.raw || {},
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
    ...(trade.raw || {}),
  };
}

function buildProposedTradeAuditEvent(tradeId, previous, updated) {
  return {
    event_type: "PROPOSED_TRADE_EDITED",
    trade_id: tradeId,
    previous_values: previous,
    new_values: updated,
    timestamp: new Date().toISOString(),
  };
}


async function listProposedTradesFromDatabase(userId) {
  const trades = await proposedTradeRepository.list(userId);

  return trades.map(proposedTradeToOrder);
}

async function readProposedOrdersForApi(userId) {
  try {
    const databaseOrders = await listProposedTradesFromDatabase(userId);
    const latestUpdatedAt = databaseOrders.reduce((latest, order) => {
      const updatedAt = order.updatedAt ? new Date(order.updatedAt) : null;
      return updatedAt && (!latest || updatedAt > latest) ? updatedAt : latest;
    }, null);

    return withPrismaSource({
      generated_at: latestUpdatedAt?.toISOString() || null,
      mode: "PAPER_PREPARATION_ONLY",
      orders: databaseOrders,
    });
  } catch (error) {
    console.error(`Proposed trade database read failed: ${error.message}`);
    return withJsonFallback(
      { generated_at: null, mode: "PAPER_PREPARATION_ONLY", orders: [] },
      error
    );
  }
}


async function syncProposedTradesFromJson(userId) {
  requireUserId(userId);
  return [];
}

async function getProposedTradeById(id, userId) {
  return proposedTradeRepository.findById(id, userId);
}

async function updateProposedTrade(id, body = {}, userId) {
  const existing = await getProposedTradeById(id, userId);

  if (!existing) {
    throw new Error("Proposed trade not found.");
  }

  const next = normalizeProposedTradeData({
    ...proposedTradeToOrder(existing),
    ...body,
    symbol: existing.symbol,
    side: body.side || existing.side,
  });
  const previousValues = {
    quantity: existing.quantity,
    entryPrice: existing.entryPrice,
    stopLoss: existing.stopLoss,
    takeProfit: existing.takeProfit,
    notes: existing.notes,
  };
  const newValues = {
    quantity: next.quantity,
    entryPrice: next.entryPrice,
    stopLoss: next.stopLoss,
    takeProfit: next.takeProfit,
    notes: body.notes ?? body.note ?? existing.notes ?? null,
  };
  const auditEvents = Array.isArray(existing.auditEvents) ? existing.auditEvents : [];

  return proposedTradeRepository.update(id, {
    quantity: next.quantity,
    entryPrice: next.entryPrice,
    stopLoss: next.stopLoss,
    takeProfit: next.takeProfit,
    notes: newValues.notes,
    confidence: next.confidence,
    score: next.score,
    recommendation: next.recommendation,
    manualOverride: true,
    auditEvents: [
      ...auditEvents,
      buildProposedTradeAuditEvent(id, previousValues, newValues),
    ],
    raw: {
      ...(existing.raw || {}),
      manualOverride: true,
      last_manual_edit: buildProposedTradeAuditEvent(id, previousValues, newValues),
    },
  }, userId);
}

async function persistProposedTradeEditFromApproval(
  existingRequest,
  updatedRequest,
  body = {},
  userId
) {
  const raw = existingRequest.raw && typeof existingRequest.raw === "object" ? existingRequest.raw : {};
  const proposedTradeId =
    raw.proposed_trade_id ||
    raw.proposedTradeId ||
    raw.id ||
    raw.order?.id ||
    updatedRequest.raw?.proposed_trade_id ||
    updatedRequest.raw?.id;
  let proposedTrade = null;

  if (proposedTradeId) {
    proposedTrade = await getProposedTradeById(
      String(proposedTradeId),
      userId
    ).catch(() => null);
  }

  if (!proposedTrade) {
    proposedTrade = await proposedTradeRepository
      .findActiveBySymbol(updatedRequest.symbol, userId)
      .catch(() => null);
  }

  const editPayload = {
    symbol: updatedRequest.symbol,
    side: updatedRequest.side,
    quantity: updatedRequest.quantity,
    entryPrice: updatedRequest.entryPrice,
    stopLoss: updatedRequest.stopLoss,
    takeProfit: updatedRequest.takeProfit,
    confidence: updatedRequest.confidence,
    score: updatedRequest.opportunityScore,
    recommendation: updatedRequest.recommendation,
    notes: body.notes ?? body.note ?? body.decisionNote ?? updatedRequest.decisionNote ?? null,
  };

  if (proposedTrade) {
    return updateProposedTrade(proposedTrade.id, editPayload, userId);
  }

  const data = normalizeProposedTradeData(editPayload);
  const now = new Date().toISOString();

  return proposedTradeRepository.create({
    ...data,
    manualOverride: true,
    auditEvents: [
      {
        event_type: "PROPOSED_TRADE_EDITED",
        trade_id: "new",
        previous_values: {},
        new_values: {
          quantity: data.quantity,
          entryPrice: data.entryPrice,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          notes: data.notes,
        },
        timestamp: now,
      },
    ],
    raw: {
      ...(data.raw || {}),
      manualOverride: true,
      created_from_approval_request_id: updatedRequest.id,
    },
  }, userId);
}

function shouldCreateApprovalForOrder(order, executionMode) {
  const route = order.execution_route?.route;

  if (executionMode === "MANUAL_APPROVAL") {
    return true;
  }

  if (executionMode === "SEMI_AUTOMATED") {
    return route === "REQUEST_APPROVAL" || route === "BLOCKED";
  }

  return route === "BLOCKED";
}

async function approvalExistsForOrder(order, userId) {
  return Boolean(await getActiveApprovalForOrder(order, userId));
}

async function getActiveApprovalForOrder(order, userId) {
  const ownerId = requireUserId(userId);
  const symbol = validateSymbol(order.symbol);

  try {
    const existing = await prisma.run((db) => db.approvalRequest.findFirst({
      where: {
        symbol,
        userId: ownerId,
        status: {
          in: ["PENDING", "APPROVED", "SNOOZED"],
        },
      },
    }));

    if (existing) {
      return existing;
    }
  } catch (error) {
    throw new Error(`Approval request duplicate check failed: ${error.message}`);
  }

  return null;
}

async function syncApprovalRequestsFromProposedOrders(userId) {
  const ownerId = requireUserId(userId);
  await syncProposedTradesFromJson(ownerId);
  const proposed = await readProposedOrdersForApi(ownerId);
  const executionMode = normalizeApprovalMode(
    proposed.execution_status?.execution_mode || proposed.mode
  );
  const orders = proposed.orders || [];
  const created = [];

  for (const order of orders) {
    if (!shouldCreateApprovalForOrder(order, executionMode)) {
      continue;
    }

    const existingApproval = await getActiveApprovalForOrder(order, ownerId);

    if (existingApproval) {
      if (order.manualOverride) {
        await updateApprovalRequestRecord(existingApproval.id, {
          quantity: getOrderQuantity(order),
          entryPrice: getOrderEntry(order),
          stopLoss: getOrderStop(order) || null,
          takeProfit: toNullableNumber(order.take_profit ?? order.takeProfit) || null,
          confidence: toNullableNumber(order.confidence),
          opportunityScore: toNullableNumber(order.score ?? order.opportunity_score),
          recommendation: order.recommendation || existingApproval.recommendation,
          decisionNote: order.notes || existingApproval.decisionNote,
          raw: {
            ...(existingApproval.raw || {}),
            proposed_trade_id: order.id,
            manualOverride: true,
            proposed_trade_audit_events: order.audit_events || [],
          },
        }, ownerId);
      }
      continue;
    }

    try {
      created.push(await createApprovalRequestRecord(buildApprovalRequestData({
        ...order,
        approvalMode: executionMode,
        reason:
          order.reason ||
          (order.execution_route?.approval_reasons || []).join("; ") ||
          order.execution_route?.route,
      }), ownerId));
    } catch (error) {
      console.error(`Approval request sync skipped for ${order.symbol}: ${error.message}`);
    }
  }

  return created;
}



  return {
    getActiveApprovalForOrder,
    getProposedTradeById,
    persistProposedTradeEditFromApproval,
    proposedTradeToOrder,
    readProposedOrdersForApi,
    syncApprovalRequestsFromProposedOrders,
    syncProposedTradesFromJson,
    updateProposedTrade,
  };
}

module.exports = createProposedTradesService;
