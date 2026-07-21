const crypto = require("node:crypto");
const { requireUserId } = require("../../../repositories/ownership");

const ACTIVE_BROKER_ORDER_STATUSES = new Set([
  "PENDING_SUBMISSION",
  "SUBMITTED",
  "PRESUBMITTED",
  "PENDING",
  "PARTIALLY_FILLED",
]);
const RETRYABLE_BROKER_ORDER_STATUSES = new Set([
  "CANCELLED",
  "EXPIRED",
  "SUBMIT_FAILED",
  "REJECTED",
]);
const TERMINAL_BROKER_ORDER_STATUSES = new Set([
  "FILLED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
  "SUBMIT_FAILED",
]);
const BROKER_ORDER_SYNC_DEDUPE_MS = 3000;

function stableSerialize(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (_error) {
    return null;
  }
}

function normalizeNullableScalar(value) {
  return value == null ? null : String(value);
}

function normalizeNullableNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(value, fallback = "UNKNOWN") {
  const normalized = String(value || fallback).trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "PRE_SUBMITTED") return "PRESUBMITTED";
  if (normalized === "PARTIALLYFILLED") return "PARTIALLY_FILLED";
  return normalized || fallback;
}

function isTerminalBrokerOrderStatus(value) {
  const status = normalizeStatus(value);
  return (
    TERMINAL_BROKER_ORDER_STATUSES.has(status) ||
    status.includes("CANCEL") ||
    status.includes("REJECT") ||
    status.includes("FAIL") ||
    status.includes("EXPIRE")
  );
}

function isActiveBrokerOrderStatus(value) {
  return !isTerminalBrokerOrderStatus(value);
}

function normalizeBrokerTimestamp(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function deriveRemainingQuantity(quantity, filledQuantity, status) {
  const normalizedQuantity = Math.max(toNumber(quantity, 0), 0);
  const normalizedFilled = Math.max(toNumber(filledQuantity, 0), 0);
  if (isTerminalBrokerOrderStatus(status)) {
    return 0;
  }
  return Math.max(normalizedQuantity - normalizedFilled, 0);
}

function buildClientOrderId(provider, userId, approvalId) {
  return [
    String(provider || "BROKER").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12) || "BROKER",
    String(userId || "").slice(0, 8).toUpperCase(),
    String(approvalId || "").slice(0, 8).toUpperCase(),
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  ].join("-");
}

function buildImportedClientOrderId(provider, brokerOrderId) {
  return [
    "IMPORTED",
    String(provider || "BROKER").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12) || "BROKER",
    String(brokerOrderId || "").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 24) || "ORDER",
  ].join("-");
}

function aggregateFills(order, fills) {
  const quantity = fills.reduce(
    (total, fill) => total + Math.abs(toNumber(fill.quantity)),
    0
  );
  const notional = fills.reduce(
    (total, fill) =>
      total + Math.abs(toNumber(fill.quantity)) * toNumber(fill.price),
    0
  );
  const fee = fills.reduce(
    (total, fill) => total + Math.abs(toNumber(fill.commission)),
    0
  );

  return {
    filled: quantity > 0,
    trade: {
      symbol: order.symbol,
      side: order.side,
      quantity,
      fill_price: quantity > 0 ? notional / quantity : null,
      fee,
      order_type: order.orderType,
      requested_price: order.limitPrice ?? null,
      filled_at:
        fills
          .map((fill) => fill.filledAt)
          .filter(Boolean)
          .sort()
          .at(-1) || new Date().toISOString(),
      slippage_bps: 0,
    },
    fills,
  };
}

function deriveOrderExecutionSnapshot(order = {}) {
  const fills = Array.isArray(order.fills) ? order.fills : [];
  const latestStatus =
    order.metadata && typeof order.metadata === "object" && order.metadata.latestStatus
      ? order.metadata.latestStatus
      : null;

  const filledQuantityFromFills = fills.reduce(
    (total, fill) => total + Math.abs(toNumber(fill.quantity)),
    0
  );
  const fillNotional = fills.reduce(
    (total, fill) => total + Math.abs(toNumber(fill.quantity)) * toNumber(fill.price),
    0
  );

  const latestFilledQuantity =
    latestStatus && Number.isFinite(Number(latestStatus.filledQuantity))
      ? Number(latestStatus.filledQuantity)
      : 0;
  const latestAverageFillPrice =
    latestStatus && Number.isFinite(Number(latestStatus.averageFillPrice))
      ? Number(latestStatus.averageFillPrice)
      : null;
  const latestLimitPrice =
    latestStatus && Number.isFinite(Number(latestStatus.limitPrice))
      ? Number(latestStatus.limitPrice)
      : null;
  const storedFilledQuantity = Number.isFinite(Number(order.filledQuantity))
    ? Number(order.filledQuantity)
    : null;
  const latestRemainingQuantity =
    latestStatus && Number.isFinite(Number(latestStatus.remainingQuantity))
      ? Number(latestStatus.remainingQuantity)
      : null;
  const storedRemainingQuantity = Number.isFinite(Number(order.remainingQuantity))
    ? Number(order.remainingQuantity)
    : null;

  const filledQuantity =
    filledQuantityFromFills > 0
      ? filledQuantityFromFills
      : storedFilledQuantity != null
        ? storedFilledQuantity
        : latestFilledQuantity;
  const averageFillPrice =
    filledQuantityFromFills > 0 && fillNotional > 0
      ? fillNotional / filledQuantityFromFills
      : latestFilledQuantity > 0 && latestAverageFillPrice != null && latestAverageFillPrice > 0
        ? latestAverageFillPrice
        : null;
  const previewReferencePrice =
    order.metadata &&
    typeof order.metadata === "object" &&
    order.metadata.preview &&
    Number.isFinite(Number(order.metadata.preview.referencePrice))
      ? Number(order.metadata.preview.referencePrice)
      : null;
  const storedLimitPrice =
    Number.isFinite(Number(order.limitPrice)) && Number(order.limitPrice) > 0
      ? Number(order.limitPrice)
      : null;
  const normalizedLatestLimitPrice =
    Number.isFinite(Number(latestLimitPrice)) && Number(latestLimitPrice) > 0
      ? Number(latestLimitPrice)
      : null;
  const limitPrice =
    String(order.orderType || "").toUpperCase() === "MARKET"
      ? null
      : storedLimitPrice ?? normalizedLatestLimitPrice;
  const displayLimitPrice =
    storedLimitPrice ?? normalizedLatestLimitPrice ?? previewReferencePrice;
  const remainingQuantity =
    storedRemainingQuantity != null
      ? storedRemainingQuantity
      : latestRemainingQuantity != null
        ? latestRemainingQuantity
        : deriveRemainingQuantity(order.quantity, filledQuantity, order.status);

  return {
    filledQuantity,
    remainingQuantity,
    averageFillPrice,
    limitPrice,
    displayLimitPrice,
  };
}

function decorateBrokerOrder(order = {}) {
  const executionSnapshot = deriveOrderExecutionSnapshot(order);
  return {
    ...order,
    filledQuantity: executionSnapshot.filledQuantity,
    remainingQuantity: executionSnapshot.remainingQuantity,
    averageFillPrice: executionSnapshot.averageFillPrice,
    limitPrice: executionSnapshot.limitPrice,
    displayLimitPrice: executionSnapshot.displayLimitPrice,
  };
}

function hasMeaningfulOrderChange(existingOrder = {}, nextOrder = {}) {
  const currentUpdatedAt = existingOrder?.lastUpdatedAt
    ? normalizeBrokerTimestamp(existingOrder.lastUpdatedAt).getTime()
    : null;
  const nextUpdatedAt = nextOrder?.lastUpdatedAt
    ? normalizeBrokerTimestamp(nextOrder.lastUpdatedAt).getTime()
    : null;

  return (
    normalizeNullableScalar(existingOrder.approvalId) !==
      normalizeNullableScalar(nextOrder.approvalId) ||
    normalizeNullableScalar(existingOrder.broker) !==
      normalizeNullableScalar(nextOrder.broker) ||
    normalizeNullableScalar(existingOrder.brokerOrderId) !==
      normalizeNullableScalar(nextOrder.brokerOrderId) ||
    normalizeNullableScalar(existingOrder.clientOrderId) !==
      normalizeNullableScalar(nextOrder.clientOrderId) ||
    normalizeNullableScalar(existingOrder.mode) !==
      normalizeNullableScalar(nextOrder.mode) ||
    normalizeNullableScalar(existingOrder.symbol) !==
      normalizeNullableScalar(nextOrder.symbol) ||
    normalizeNullableScalar(existingOrder.side) !==
      normalizeNullableScalar(nextOrder.side) ||
    normalizeNullableScalar(existingOrder.orderType) !==
      normalizeNullableScalar(nextOrder.orderType) ||
    toNumber(existingOrder.quantity) !== toNumber(nextOrder.quantity) ||
    toNumber(existingOrder.filledQuantity) !== toNumber(nextOrder.filledQuantity) ||
    toNumber(existingOrder.remainingQuantity) !== toNumber(nextOrder.remainingQuantity) ||
    normalizeNullableNumber(existingOrder.limitPrice) !==
      normalizeNullableNumber(nextOrder.limitPrice) ||
    normalizeStatus(existingOrder.status) !== normalizeStatus(nextOrder.status) ||
    currentUpdatedAt !== nextUpdatedAt ||
    stableSerialize(existingOrder.metadata?.latestStatus || null) !==
      stableSerialize(nextOrder.metadata?.latestStatus || null)
  );
}

function buildAnalysisUpdate(preTradeAnalysis) {
  return {
    preTradeAnalysisJson: preTradeAnalysis,
    safetyViolationsJson: preTradeAnalysis.safety_violations || [],
    newsEventsJson: preTradeAnalysis.upcoming_events || [],
    openaiReasoningJson: preTradeAnalysis.news_reasoning || {},
  };
}

function preserveStrategyAttribution(approval, preTradeAnalysis = {}) {
  const existingPreTrade =
    approval?.preTradeAnalysisJson && typeof approval.preTradeAnalysisJson === "object"
      ? approval.preTradeAnalysisJson
      : {};
  const existingRaw =
    approval?.raw && typeof approval.raw === "object" ? approval.raw : {};
  const existingStrategyAudit =
    existingRaw.strategy_audit && typeof existingRaw.strategy_audit === "object"
      ? existingRaw.strategy_audit
      : {};
  const strategyVersionId =
    existingRaw.latest_scan?.strategyVersionId ||
    existingRaw.latest_scan?.strategy_version_id ||
    existingRaw.order?.strategyVersionId ||
    existingRaw.order?.strategy_version_id ||
    existingRaw.order?.strategyConfig?.strategyVersionId ||
    existingRaw.order?.strategyConfig?.strategy_version_id ||
    existingRaw.order?.strategy_config?.strategyVersionId ||
    existingRaw.order?.strategy_config?.strategy_version_id ||
    existingRaw.order?.active_strategy?.strategyVersionId ||
    existingRaw.order?.active_strategy?.strategy_version_id ||
    existingRaw.order?.active_strategy_config?.strategyVersionId ||
    existingRaw.order?.active_strategy_config?.strategy_version_id ||
    existingRaw.strategyVersionId ||
    existingRaw.strategy_version_id ||
    existingRaw.active_strategy?.strategyVersionId ||
    existingRaw.active_strategy?.strategy_version_id ||
    existingStrategyAudit.strategyVersionId ||
    existingStrategyAudit.strategy_version_id ||
    existingRaw.active_strategy_config?.strategyVersionId ||
    existingRaw.latest_scan?.raw?.strategyVersionId ||
    existingRaw.latest_scan?.raw?.strategy_version_id ||
    existingRaw.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    existingRaw.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    existingRaw.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    existingRaw.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    existingRaw.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    existingRaw.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    existingPreTrade.strategyVersionId ||
    existingPreTrade.strategy_version_id ||
    existingPreTrade.strategy?.versionId ||
    existingPreTrade.strategy?.strategyVersionId ||
    existingPreTrade.strategy_config?.strategyVersionId ||
    existingPreTrade.strategy_config?.strategy_version_id ||
    existingPreTrade.latest_scan?.strategyVersionId ||
    existingPreTrade.latest_scan?.strategy_version_id ||
    existingPreTrade.latest_scan?.raw?.strategyVersionId ||
    existingPreTrade.latest_scan?.raw?.strategy_version_id ||
    existingPreTrade.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    existingPreTrade.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    existingPreTrade.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    existingPreTrade.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    existingPreTrade.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    existingPreTrade.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    preTradeAnalysis.strategyVersionId ||
    preTradeAnalysis.strategy_version_id ||
    preTradeAnalysis.strategy?.versionId ||
    preTradeAnalysis.strategy?.strategyVersionId ||
    null;
  const activeStrategyConfig =
    existingRaw.active_strategy_config ||
    existingRaw.latest_scan?.raw?.active_strategy_config ||
    existingRaw.latest_scan?.raw?.strategy_config ||
    existingPreTrade.active_strategy_config ||
    existingPreTrade.latest_scan?.raw?.active_strategy_config ||
    existingPreTrade.latest_scan?.raw?.strategy_config ||
    preTradeAnalysis.active_strategy_config ||
    preTradeAnalysis.latest_scan?.raw?.active_strategy_config ||
    preTradeAnalysis.latest_scan?.raw?.strategy_config ||
    null;

  return {
    ...preTradeAnalysis,
    strategyVersionId: strategyVersionId || null,
    strategy_version_id: strategyVersionId || null,
    strategy_name:
      preTradeAnalysis.strategy_name ||
      existingPreTrade.strategy_name ||
      existingStrategyAudit.strategy_name ||
      null,
    strategy_source:
      preTradeAnalysis.strategy_source ||
      existingPreTrade.strategy_source ||
      existingStrategyAudit.strategy_source ||
      null,
    strategy_config:
      preTradeAnalysis.strategy_config ||
      existingPreTrade.strategy_config ||
      existingStrategyAudit.strategy_config ||
      null,
    suggestion_basis:
      preTradeAnalysis.suggestion_basis ||
      existingPreTrade.suggestion_basis ||
      existingStrategyAudit.suggestion_basis ||
      null,
    active_strategy_config: activeStrategyConfig,
    strategy: {
      ...(existingPreTrade.strategy || {}),
      ...(preTradeAnalysis.strategy || {}),
      versionId:
        preTradeAnalysis.strategy?.versionId ||
        preTradeAnalysis.strategy?.strategyVersionId ||
        existingPreTrade.strategy?.versionId ||
        existingPreTrade.strategy?.strategyVersionId ||
        strategyVersionId ||
        null,
      strategyVersionId:
        preTradeAnalysis.strategy?.strategyVersionId ||
        preTradeAnalysis.strategy?.versionId ||
        existingPreTrade.strategy?.strategyVersionId ||
        existingPreTrade.strategy?.versionId ||
        strategyVersionId ||
        null,
    },
  };
}

function getExecutionBlockReason(preTradeAnalysis = {}) {
  return (
    preTradeAnalysis?.explanation ||
    preTradeAnalysis?.safety_violations?.[0] ||
    preTradeAnalysis?.checklist?.[0] ||
    preTradeAnalysis?.news_reasoning?.reasoning ||
    "Pre-trade analysis flagged this approval for manual review."
  );
}

function buildLiveGuardPayload(userId, approval, order, marketData) {
  return {
    userId,
    mode: "PAPER_BROKER",
    approvalId: approval.id,
    symbol: approval.symbol,
    side: approval.side,
    quantity: approval.quantity,
    estimatedNotional:
      toNumber(approval.quantity) *
      toNumber(
        approval.entryPrice ??
          order.limitPrice ??
          marketData?.marketData?.close ??
          marketData?.marketData?.last
      ),
    brokerAccountId: null,
  };
}

function buildPreviewResponse({ approval, marketData, orderPayload, preTradeAnalysis, preview }) {
  return {
    approvalId: approval.id,
    symbol: approval.symbol,
    order: {
      ...orderPayload,
      symbol: approval.symbol,
      side: approval.side,
      quantity: approval.quantity,
    },
    marketData: marketData?.marketData || null,
    preview: preview?.preview || null,
    preTradeAnalysis,
    requiresConfirmation: true,
  };
}

function createBrokerPaperExecutionService({
  getAdapterForUser,
  brokerOrdersRepository,
  getApprovalRequestById,
  getRequestOrderPayload,
  invalidateBrokerAccountCache = async () => {},
  readResolvedBrokerConfigForUser = null,
  liveExecutionGuard,
  persistPaperExecutionResult,
  prisma,
  runPreTradeAnalysis,
  updateApprovalRequestRecord,
}) {
  const brokerOrderSyncState = new Map();

  async function getRuntimeInput(userId, input = {}) {
    const resolved = readResolvedBrokerConfigForUser
      ? await readResolvedBrokerConfigForUser(userId)
      : null;

    return {
      ...(resolved?.config || {}),
      ...(input || {}),
      provider: resolved?.provider || input?.provider || null,
      executionMode: resolved?.executionMode || input?.executionMode || undefined,
    };
  }

  async function resolveActiveBroker(userId, options = {}) {
    const runtimeInput = await getRuntimeInput(userId, options.runtimeInput || options);
    return String(runtimeInput?.provider || "").trim().toUpperCase() || null;
  }

  async function assertApprovedRequest(userId, approvalId) {
    const request = await getApprovalRequestById(approvalId, userId);
    if (!request) {
      const error = new Error("Approval request not found.");
      error.statusCode = 404;
      throw error;
    }
    if (request.status !== "APPROVED") {
      const error = new Error("Approval request must be APPROVED before broker paper execution.");
      error.statusCode = 409;
      throw error;
    }
    return request;
  }

  function getBrokerOrderSyncKey(userId, provider = null) {
    return [String(userId || ""), String(provider || "UNKNOWN")].join(":");
  }

  function normalizeBrokerOrderForPersistence(remoteOrder = {}, existingOrder = null, provider = "BROKER") {
    const normalizedStatus = normalizeStatus(
      remoteOrder.status,
      existingOrder?.status || "UNKNOWN"
    );
    const quantity = Math.max(
      toNumber(remoteOrder.quantity, existingOrder?.quantity ?? 0),
      0
    );
    const filledQuantity = Math.max(
      toNumber(remoteOrder.filledQuantity, existingOrder?.filledQuantity ?? 0),
      0
    );
    const remainingQuantity = deriveRemainingQuantity(
      quantity,
      filledQuantity,
      normalizedStatus
    );

    return {
      approvalId: existingOrder?.approvalId || null,
      broker: String(existingOrder?.broker || remoteOrder.broker || provider || "BROKER").toUpperCase(),
      brokerOrderId: String(remoteOrder.brokerOrderId || existingOrder?.brokerOrderId || ""),
      clientOrderId:
        existingOrder?.clientOrderId ||
        remoteOrder.clientOrderId ||
        buildImportedClientOrderId(provider, remoteOrder.brokerOrderId),
      mode: existingOrder?.mode || "PAPER_BROKER",
      symbol: remoteOrder.symbol || existingOrder?.symbol || "",
      side: remoteOrder.side || existingOrder?.side || "BUY",
      orderType: remoteOrder.orderType || existingOrder?.orderType || "MARKET",
      quantity,
      filledQuantity,
      remainingQuantity,
      limitPrice:
        remoteOrder.limitPrice == null ? existingOrder?.limitPrice ?? null : remoteOrder.limitPrice,
      status: normalizedStatus,
      submittedAt: normalizeBrokerTimestamp(
        remoteOrder.createdAt,
        existingOrder?.submittedAt || new Date()
      ),
      lastUpdatedAt: normalizeBrokerTimestamp(
        remoteOrder.updatedAt,
        new Date()
      ),
      lastSyncedAt: new Date(),
      metadata: {
        ...(existingOrder?.metadata || {}),
        latestStatus: remoteOrder,
        synchronizedFromBroker: true,
      },
    };
  }

  async function synchronizeOrders(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const runtimeInput = await getRuntimeInput(ownerId, options.runtimeInput || {});
    const forceRefresh = Boolean(options.forceRefresh);
    const activeBroker =
      String(runtimeInput?.provider || "").trim().toUpperCase() || "UNKNOWN";
    const syncKey = getBrokerOrderSyncKey(ownerId, activeBroker);
    const now = Date.now();
    const existingState = brokerOrderSyncState.get(syncKey);

    if (
      !forceRefresh &&
      existingState?.promise &&
      now - existingState.startedAt < BROKER_ORDER_SYNC_DEDUPE_MS
    ) {
      return existingState.promise;
    }
    if (
      !forceRefresh &&
      existingState?.result &&
      existingState?.completedAt &&
      now - existingState.completedAt < BROKER_ORDER_SYNC_DEDUPE_MS
    ) {
      return existingState.result;
    }

    const syncPromise = (async () => {
      const adapter = await getAdapterForUser(ownerId);
      const fetchedOrders =
        typeof adapter.getOrders === "function"
          ? await adapter.getOrders(ownerId, {
              ...runtimeInput,
              historyDays: options.historyDays || 14,
            })
          : typeof adapter.getOpenOrders === "function"
            ? {
                orders: await adapter.getOpenOrders(ownerId, runtimeInput),
              }
            : { orders: [] };

      const brokerOrders = Array.isArray(fetchedOrders?.orders) ? fetchedOrders.orders : [];
      const persistedOrders = await brokerOrdersRepository.listOrders(ownerId, {
        limit: options.limit || 500,
        broker: activeBroker,
      });
      const persistedByBrokerOrderId = new Map(
        persistedOrders
          .filter((order) => order.brokerOrderId)
          .map((order) => [String(order.brokerOrderId), order])
      );
      const persistedByClientOrderId = new Map(
        persistedOrders
          .filter((order) => order.clientOrderId)
          .map((order) => [String(order.clientOrderId), order])
      );

      const remoteOrderMap = new Map();
      for (const remoteOrder of brokerOrders) {
        const brokerOrderId = String(remoteOrder?.brokerOrderId || "").trim();
        if (!brokerOrderId) continue;
        remoteOrderMap.set(brokerOrderId, remoteOrder);
      }

      const localOrdersNeedingDirectRefresh = persistedOrders.filter(
        (order) =>
          order?.brokerOrderId &&
          isActiveBrokerOrderStatus(order.status) &&
          !remoteOrderMap.has(String(order.brokerOrderId))
      );

      const directlyRefreshedOrders = await Promise.all(
        localOrdersNeedingDirectRefresh.map(async (order) => {
          try {
            const result = await adapter.getOrderStatus(ownerId, {
              brokerOrderId: order.brokerOrderId,
              clientOrderId: order.clientOrderId,
              symbol: order.symbol,
            }, runtimeInput);
            return result?.order || null;
          } catch (_error) {
            return null;
          }
        })
      );

      for (const refreshedOrder of directlyRefreshedOrders.filter(Boolean)) {
        remoteOrderMap.set(String(refreshedOrder.brokerOrderId), refreshedOrder);
      }

      const syncStats = {
        created: 0,
        updated: 0,
        unchanged: 0,
      };

      const upsertedOrders = await prisma.run((db) =>
        db.$transaction(async (transaction) => {
          const synchronized = [];

          for (const remoteOrder of remoteOrderMap.values()) {
            const brokerOrderId = String(remoteOrder?.brokerOrderId || "").trim();
            if (!brokerOrderId) continue;

            const existingOrder =
              persistedByBrokerOrderId.get(brokerOrderId) ||
              (remoteOrder.clientOrderId
                ? persistedByClientOrderId.get(String(remoteOrder.clientOrderId))
                : null) ||
              null;

            const nextOrder = normalizeBrokerOrderForPersistence(
              remoteOrder,
              existingOrder,
              adapter.provider
            );

            if (existingOrder) {
              if (!hasMeaningfulOrderChange(existingOrder, nextOrder)) {
                syncStats.unchanged += 1;
                synchronized.push(existingOrder);
                continue;
              }

              const updated = await brokerOrdersRepository.updateOrder(
                transaction,
                ownerId,
                existingOrder.id,
                nextOrder
              );
              await brokerOrdersRepository.appendEvent(
                transaction,
                ownerId,
                existingOrder.id,
                "SYNC_STATUS",
                {
                  brokerOrderId,
                  status: nextOrder.status,
                  filledQuantity: nextOrder.filledQuantity,
                  remainingQuantity: nextOrder.remainingQuantity,
                  source: options.source || "broker_refresh",
                }
              );
              syncStats.updated += 1;
              synchronized.push(updated);
              continue;
            }

            const created = await brokerOrdersRepository.createSubmittedOrder(transaction, {
              userId: ownerId,
              ...nextOrder,
            });
            await brokerOrdersRepository.appendEvent(
              transaction,
              ownerId,
              created.id,
              "SYNC_DISCOVERED",
              {
                brokerOrderId,
                clientOrderId: nextOrder.clientOrderId,
                status: nextOrder.status,
                source: options.source || "broker_refresh",
              }
            );
            syncStats.created += 1;
            synchronized.push(created);
          }

          return synchronized;
        })
      );

      if (
        !options.skipInvalidateCache &&
        (syncStats.created > 0 || syncStats.updated > 0)
      ) {
        await invalidateBrokerAccountCache(ownerId);
      }

      console.info(
        `[Broker Sync] user=${ownerId} source=${
          options.source || "broker_refresh"
        } created=${syncStats.created} updated=${syncStats.updated} unchanged=${
          syncStats.unchanged
        } fetched=${brokerOrders.length} refreshed=${directlyRefreshedOrders.filter(Boolean).length}`
      );

      return {
        synchronizedAt: new Date().toISOString(),
        orders: upsertedOrders.map(decorateBrokerOrder),
        stats: syncStats,
      };
    })();

    brokerOrderSyncState.set(syncKey, {
      startedAt: now,
      promise: syncPromise,
    });

    try {
      const result = await syncPromise;
      brokerOrderSyncState.set(syncKey, {
        startedAt: now,
        completedAt: Date.now(),
        promise: null,
        result,
      });
      return result;
    } catch (error) {
      brokerOrderSyncState.delete(syncKey);
      throw error;
    }
  }

  async function listOrders(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const broker =
      options.broker || (await resolveActiveBroker(ownerId, options));
    const orders = await brokerOrdersRepository.listOrders(ownerId, {
      ...options,
      broker,
    });
    return orders.map(decorateBrokerOrder);
  }

  async function listFills(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const broker =
      options.broker || (await resolveActiveBroker(ownerId, options));
    return brokerOrdersRepository.listFills(ownerId, {
      ...options,
      broker,
    });
  }

  async function prepareExecution(userId, approvalId, input = {}) {
    const ownerId = requireUserId(userId);
    const adapter = await getAdapterForUser(ownerId);
    const runtimeInput = await getRuntimeInput(ownerId, input.runtimeInput || {});
    const approval = await assertApprovedRequest(ownerId, approvalId);
    const orderPayload = getRequestOrderPayload(approval);
    const preTradeAnalysis = await runPreTradeAnalysis(ownerId, {
      symbol: approval.symbol,
      side: approval.side,
      quantity: approval.quantity,
      entryPrice: approval.entryPrice,
      stopLoss: approval.stopLoss,
      takeProfit: approval.takeProfit,
      simulationMode: true,
    });

    const manualOverride = Boolean(input.manualOverride);
    const blockReason = getExecutionBlockReason(preTradeAnalysis);
    const attributedPreTradeAnalysis = preserveStrategyAttribution(
      approval,
      preTradeAnalysis
    );

    if (!preTradeAnalysis.allow_trade && !manualOverride) {
      const analysisUpdate = buildAnalysisUpdate(attributedPreTradeAnalysis);
      const updated = await updateApprovalRequestRecord(
        approval.id,
        {
          ...analysisUpdate,
          riskLevel: preTradeAnalysis.risk_level || approval.riskLevel,
          recommendation: preTradeAnalysis.recommendation || approval.recommendation,
          decisionNote: `Broker paper execution blocked: ${blockReason}`,
        },
        ownerId
      );
      const error = new Error("Broker paper execution blocked by pre-trade analysis.");
      error.statusCode = 409;
      error.approvalRequest = updated;
      error.preTradeAnalysis = preTradeAnalysis;
      error.overrideEligible = true;
      error.blockReason = blockReason;
      throw error;
    }

    const existingOrder = await brokerOrdersRepository.findByApprovalId(
      ownerId,
      approval.id
    );
    if (
      existingOrder &&
      !RETRYABLE_BROKER_ORDER_STATUSES.has(normalizeStatus(existingOrder.status))
    ) {
      const error = new Error("A broker paper order already exists for this approval.");
      error.statusCode = 409;
      error.brokerOrder = existingOrder;
      throw error;
    }

    const marketData = await adapter.getMarketData(ownerId, approval.symbol, runtimeInput);
    await liveExecutionGuard.assertLiveExecutionAllowed(
      {
        ...buildLiveGuardPayload(ownerId, approval, orderPayload, marketData),
        manualOverride,
      }
    );
    const preview = await adapter.previewOrder(ownerId, {
      ...orderPayload,
      symbol: approval.symbol,
      side: approval.side,
      quantity: approval.quantity,
      limitPrice: approval.entryPrice,
    }, runtimeInput);

    return {
      approval,
      marketData,
      orderPayload,
      preTradeAnalysis: attributedPreTradeAnalysis,
      manualOverride,
      blockReason,
      preview,
      adapter,
      runtimeInput,
    };
  }

  async function previewApproval(userId, approvalId) {
    const prepared = await prepareExecution(userId, approvalId);
    return buildPreviewResponse(prepared);
  }

  async function syncOrder(userId, brokerOrderRecordId, options = {}) {
    const ownerId = requireUserId(userId);
    const runtimeInput = await getRuntimeInput(ownerId, options.runtimeInput || {});
    let order = await brokerOrdersRepository.getOrderById(ownerId, brokerOrderRecordId);
    if (!order) {
      const error = new Error("Broker order not found.");
      error.statusCode = 404;
      throw error;
    }

    // First run the same historical broker synchronization used by background refreshes.
    // This catches terminal orders that have disappeared from the broker's active-order view.
    const synchronization = await synchronizeOrders(ownerId, {
      forceRefresh: true,
      source: options.source || "manual_sync",
      historyDays: options.historyDays || 90,
      skipInvalidateCache: true,
      runtimeInput,
    });
    const synchronizedMatch = (synchronization?.orders || []).find(
      (item) =>
        item?.id === order.id ||
        (item?.brokerOrderId && item.brokerOrderId === order.brokerOrderId) ||
        (item?.clientOrderId && item.clientOrderId === order.clientOrderId)
    );
    if (
      synchronizedMatch &&
      isTerminalBrokerOrderStatus(synchronizedMatch.status) &&
      normalizeStatus(synchronizedMatch.status) !== "FILLED"
    ) {
      return {
        brokerOrder: synchronizedMatch,
        paperExecution: null,
        approvalId: synchronizedMatch.approvalId || order.approvalId || null,
      };
    }

    order = await brokerOrdersRepository.getOrderById(ownerId, brokerOrderRecordId);
    if (!order) {
      const error = new Error("Broker order not found after synchronization.");
      error.statusCode = 404;
      throw error;
    }

    const adapter = await getAdapterForUser(ownerId);
    const [statusResult, fillsResult] = await Promise.all([
      adapter.getOrderStatus(ownerId, {
        brokerOrderId: order.brokerOrderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
      }, runtimeInput),
      adapter.getExecutions(ownerId, {
        brokerOrderId: order.brokerOrderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
      }, runtimeInput),
    ]);

    const normalizedStatus = normalizeStatus(statusResult?.order?.status, order.status);
    const fills = Array.isArray(fillsResult?.fills) ? fillsResult.fills : [];
    const filledQuantity = Math.max(
      toNumber(statusResult?.order?.filledQuantity, order.filledQuantity ?? 0),
      0
    );
    const remainingQuantity = deriveRemainingQuantity(
      statusResult?.order?.quantity ?? order.quantity,
      filledQuantity,
      normalizedStatus
    );

    const syncedOrder = await prisma.run((db) =>
      db.$transaction(async (transaction) => {
        for (const fill of fills) {
          await brokerOrdersRepository.upsertFill(transaction, ownerId, {
            brokerOrderId: order.id,
            symbol: fill.symbol || order.symbol,
            side: String(fill.side || order.side).toUpperCase() === "SLD" ? "SELL" : String(fill.side || order.side).toUpperCase(),
            quantity: Math.abs(toNumber(fill.quantity)),
            price: toNumber(fill.price),
            commission: toNumber(fill.commission, 0),
            filledAt: fill.filledAt ? new Date(fill.filledAt) : new Date(),
            executionId: fill.executionId || null,
            raw: fill,
          });
        }

        await brokerOrdersRepository.appendEvent(
          transaction,
          ownerId,
          order.id,
          "SYNC_STATUS",
          {
            status: normalizedStatus,
            fillCount: fills.length,
            brokerOrderId: order.brokerOrderId,
            source: options.source || "manual_sync",
          }
        );

        return brokerOrdersRepository.updateOrder(transaction, ownerId, order.id, {
          status: normalizedStatus,
          filledQuantity,
          remainingQuantity,
          metadata: {
            ...(order.metadata || {}),
            latestStatus: statusResult?.order || null,
            latestFills: fills,
          },
          lastUpdatedAt: normalizeBrokerTimestamp(
            statusResult?.order?.updatedAt,
            new Date()
          ),
          lastSyncedAt: new Date(),
        });
      })
    );

    const decoratedOrder = decorateBrokerOrder(syncedOrder);
    const approval = decoratedOrder.approvalId
      ? await getApprovalRequestById(decoratedOrder.approvalId, ownerId)
      : null;

    let paperExecution = null;
    if (
      approval &&
      approval.status === "APPROVED" &&
      normalizedStatus === "FILLED" &&
      decoratedOrder.fills.length > 0
    ) {
      const totalFilledQuantity = decoratedOrder.fills.reduce(
        (total, fill) => total + Math.abs(toNumber(fill.quantity)),
        0
      );

      if (totalFilledQuantity >= toNumber(decoratedOrder.quantity)) {
        const result = aggregateFills(decoratedOrder, decoratedOrder.fills);
        const persisted = await persistPaperExecutionResult(
          ownerId,
          approval.id,
          result,
          {
            raw: {
              broker_order_id: decoratedOrder.id,
              broker_fill_count: decoratedOrder.fills.length,
              broker_fill_ids: decoratedOrder.fills.map((fill) => fill.id),
            },
          },
          options.decisionNote || approval.decisionNote || null
        );
        paperExecution = persisted.paper_execution;
      }
    }

    await invalidateBrokerAccountCache(ownerId);

    return {
      brokerOrder: decoratedOrder,
      paperExecution,
      approvalId: decoratedOrder.approvalId,
    };
  }

  async function importExternalOrder(userId, input = {}) {
    const ownerId = requireUserId(userId);
    const adapter = await getAdapterForUser(ownerId);
    const runtimeInput = await getRuntimeInput(ownerId, input.runtimeInput || {});
    const statusResult = await adapter.getOrderStatus(ownerId, {
      brokerOrderId: input.brokerOrderId,
      orderId: input.brokerOrderId,
      symbol: input.symbol || null,
    }, runtimeInput);
    const remoteOrder = statusResult?.order || null;

    if (!remoteOrder?.brokerOrderId) {
      const error = new Error("Broker order could not be loaded for import.");
      error.statusCode = 404;
      throw error;
    }

    const existingByBrokerOrderId = await brokerOrdersRepository.findByBrokerOrderId(
      ownerId,
      remoteOrder.brokerOrderId
    );
    if (existingByBrokerOrderId) {
      return {
        brokerOrder: existingByBrokerOrderId,
        imported: false,
        alreadyTracked: true,
      };
    }

    const desiredClientOrderId =
      remoteOrder.clientOrderId ||
      buildImportedClientOrderId(adapter.provider, remoteOrder.brokerOrderId);
    const existingByClientOrderId = await brokerOrdersRepository.findByClientOrderId(
      ownerId,
      desiredClientOrderId
    );
    if (existingByClientOrderId) {
      return {
        brokerOrder: existingByClientOrderId,
        imported: false,
        alreadyTracked: true,
      };
    }

    const createdOrder = await prisma.run((db) =>
      db.$transaction(async (transaction) => {
        const created = await brokerOrdersRepository.createSubmittedOrder(transaction, {
          userId: ownerId,
          approvalId: null,
          broker: adapter.provider,
          brokerOrderId: remoteOrder.brokerOrderId,
          clientOrderId: desiredClientOrderId,
          mode: "PAPER_BROKER",
          symbol: remoteOrder.symbol,
          side: remoteOrder.side || "BUY",
          orderType: remoteOrder.orderType || "MARKET",
          quantity: toNumber(remoteOrder.quantity, 0),
          filledQuantity: Math.max(toNumber(remoteOrder.filledQuantity, 0), 0),
          remainingQuantity: deriveRemainingQuantity(
            remoteOrder.quantity,
            remoteOrder.filledQuantity,
            remoteOrder.status
          ),
          limitPrice: remoteOrder.limitPrice ?? null,
          status: normalizeStatus(remoteOrder.status, "SUBMITTED"),
          submittedAt: remoteOrder.createdAt ? new Date(remoteOrder.createdAt) : new Date(),
          lastUpdatedAt: new Date(),
          lastSyncedAt: new Date(),
          metadata: {
            importedFromBroker: true,
            importSource: "manual_reconciliation",
            latestStatus: remoteOrder,
          },
        });

        await brokerOrdersRepository.appendEvent(
          transaction,
          ownerId,
          created.id,
          "IMPORTED_FROM_BROKER",
          {
            brokerOrderId: remoteOrder.brokerOrderId,
            clientOrderId: desiredClientOrderId,
            symbol: remoteOrder.symbol,
            status: remoteOrder.status,
          }
        );

        return created;
      })
    );

    const synced = await syncOrder(ownerId, createdOrder.id, {
      source: "import_from_broker",
      runtimeInput,
    });

    return {
      ...synced,
      imported: true,
      alreadyTracked: false,
    };
  }

  async function executeApproval(userId, approvalId, input = {}) {
    const ownerId = requireUserId(userId);
    const prepared = await prepareExecution(ownerId, approvalId, input);
    if (!input.confirmSubmit) {
      return buildPreviewResponse(prepared);
    }

    const clientOrderId = buildClientOrderId(prepared.adapter.provider, ownerId, approvalId);
    const duplicateClientOrder = await brokerOrdersRepository.findByClientOrderId(
      ownerId,
      clientOrderId
    );
    if (duplicateClientOrder) {
      const error = new Error("Duplicate broker clientOrderId detected.");
      error.statusCode = 409;
      throw error;
    }

    const initialOrder = await prisma.run((db) =>
      db.$transaction(async (transaction) => {
        const created = await brokerOrdersRepository.createSubmittedOrder(transaction, {
          userId: ownerId,
          approvalId: prepared.approval.id,
          broker: prepared.adapter.provider,
          brokerOrderId: null,
          clientOrderId,
          mode: "PAPER_BROKER",
          symbol: prepared.approval.symbol,
          side: prepared.approval.side,
          orderType: prepared.orderPayload.orderType || "MARKET",
          quantity: prepared.approval.quantity,
          filledQuantity: 0,
          remainingQuantity: prepared.approval.quantity,
          limitPrice: prepared.approval.entryPrice ?? null,
          status: "PENDING_SUBMISSION",
          submittedAt: null,
          lastUpdatedAt: new Date(),
          metadata: {
            marketData: prepared.marketData?.marketData || null,
            preview: prepared.preview?.preview || null,
            preTradeAnalysis: prepared.preTradeAnalysis,
            manualOverride: prepared.manualOverride
              ? {
                  applied: true,
                  reason: prepared.blockReason,
                  at: new Date().toISOString(),
                }
              : null,
          },
        });
        await brokerOrdersRepository.appendEvent(
          transaction,
          ownerId,
          created.id,
          "PREVIEW_CONFIRMED",
          {
            clientOrderId,
            approvalId: prepared.approval.id,
          }
        );
        return created;
      })
    );

    try {
      const submitResult = await prepared.adapter.placeOrder(ownerId, {
        ...prepared.orderPayload,
        symbol: prepared.approval.symbol,
        side: prepared.approval.side,
        quantity: prepared.approval.quantity,
        limitPrice: prepared.approval.entryPrice ?? null,
        clientOrderId,
      }, prepared.runtimeInput);

      const submittedOrder = await prisma.run((db) =>
        db.$transaction(async (transaction) => {
          await brokerOrdersRepository.appendEvent(
            transaction,
            ownerId,
            initialOrder.id,
            "SUBMITTED",
            submitResult.order || null
          );
          return brokerOrdersRepository.updateOrder(transaction, ownerId, initialOrder.id, {
            brokerOrderId: submitResult.order?.brokerOrderId || null,
            status: normalizeStatus(submitResult.order?.status, "SUBMITTED"),
            filledQuantity: Math.max(toNumber(submitResult.order?.filledQuantity, 0), 0),
            remainingQuantity: deriveRemainingQuantity(
              submitResult.order?.quantity ?? initialOrder.quantity,
              submitResult.order?.filledQuantity,
              submitResult.order?.status || "SUBMITTED"
            ),
            submittedAt: new Date(),
            lastUpdatedAt: normalizeBrokerTimestamp(
              submitResult.order?.updatedAt,
              new Date()
            ),
            lastSyncedAt: new Date(),
            metadata: {
              ...(initialOrder.metadata || {}),
              submitResult,
            },
          });
        })
      );

      const synced = await syncOrder(ownerId, submittedOrder.id, {
        decisionNote:
          input.decisionNote ||
          (prepared.manualOverride
            ? `Manual override applied for broker paper execution. ${prepared.blockReason}`
            : null),
        source: "post_submit_sync",
      });
      return {
        ...synced,
        preview: prepared.preview?.preview || null,
        marketData: prepared.marketData?.marketData || null,
        manualOverride: prepared.manualOverride,
        blockReason: prepared.manualOverride ? prepared.blockReason : null,
      };
    } catch (error) {
      await prisma.run((db) =>
        db.$transaction(async (transaction) => {
          await brokerOrdersRepository.appendEvent(
            transaction,
            ownerId,
            initialOrder.id,
            "SUBMIT_FAILED",
            {
              error: error.message,
              details: error.details || null,
            }
          );
          await brokerOrdersRepository.updateOrder(transaction, ownerId, initialOrder.id, {
            status: "SUBMIT_FAILED",
            remainingQuantity: 0,
            lastUpdatedAt: new Date(),
            metadata: {
              ...(initialOrder.metadata || {}),
              submitError: error.message,
              submitErrorDetails: error.details || null,
            },
          });
        })
      );
      throw error;
    }
  }

  async function cancelOrder(userId, brokerOrderRecordId) {
    const ownerId = requireUserId(userId);
    const runtimeInput = await getRuntimeInput(ownerId);
    const order = await brokerOrdersRepository.getOrderById(ownerId, brokerOrderRecordId);
    if (!order) {
      const error = new Error("Broker order not found.");
      error.statusCode = 404;
      throw error;
    }
    const adapter = await getAdapterForUser(ownerId);
    const result = await adapter.cancelOrder(ownerId, order.brokerOrderId, runtimeInput);
    return prisma.run((db) =>
      db.$transaction(async (transaction) => {
        await brokerOrdersRepository.appendEvent(
          transaction,
          ownerId,
          order.id,
          "CANCELLED",
          result.order || null
        );
        return brokerOrdersRepository.updateOrder(transaction, ownerId, order.id, {
          status: "CANCELLED",
          remainingQuantity: 0,
          lastUpdatedAt: normalizeBrokerTimestamp(
            result.order?.updatedAt,
            new Date()
          ),
          lastSyncedAt: new Date(),
          metadata: {
            ...(order.metadata || {}),
            cancelResult: result,
          },
        });
      })
    );
  }

  async function markOrderCancelled(userId, brokerOrderRecordId, options = {}) {
    const ownerId = requireUserId(userId);
    const order = await brokerOrdersRepository.getOrderById(ownerId, brokerOrderRecordId);
    if (!order) {
      const error = new Error("Broker order not found.");
      error.statusCode = 404;
      throw error;
    }

    const normalizedStatus = normalizeStatus(order.status);
    if (normalizedStatus === "CANCELLED") {
      return decorateBrokerOrder(order);
    }

    return prisma.run((db) =>
      db.$transaction(async (transaction) => {
        await brokerOrdersRepository.appendEvent(
          transaction,
          ownerId,
          order.id,
          "MARKED_CANCELLED_MANUALLY",
          {
            source: options.source || "reconciliation_manual_resolution",
            reason:
              options.reason ||
              "Tracked in Quant's Trade but no longer present in broker open orders.",
            previousStatus: order.status || null,
            brokerOrderId: order.brokerOrderId || null,
            clientOrderId: order.clientOrderId || null,
          }
        );

        const updated = await brokerOrdersRepository.updateOrder(
          transaction,
          ownerId,
          order.id,
          {
            status: "CANCELLED",
            remainingQuantity: 0,
            lastUpdatedAt: new Date(),
            lastSyncedAt: new Date(),
            metadata: {
              ...(order.metadata || {}),
              manualResolution: {
                type: "MARK_CANCELLED",
                source: options.source || "reconciliation_manual_resolution",
                reason:
                  options.reason ||
                  "Tracked in Quant's Trade but no longer present in broker open orders.",
                resolvedAt: new Date().toISOString(),
              },
            },
          }
        );

        return decorateBrokerOrder(updated);
      })
    );
  }

  return {
    cancelOrder,
    executeApproval,
    importExternalOrder,
    listFills,
    listOrders,
    markOrderCancelled,
    previewApproval,
    synchronizeOrders,
    syncOrder,
  };
}

module.exports = createBrokerPaperExecutionService;
