import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelWorkspaceBrokerOrder,
  getBrokerPreflight,
  getTradingSession,
  modifyWorkspaceBrokerOrder,
  getWorkspaceBrokerExecutions,
  getWorkspaceBrokerOrderStatus,
  placeManualBrokerOrder,
  previewManualBrokerOrder,
  synchronizeBrokerState,
} from "../../broker/hooks/brokerApi";
import { subscribeBrokerRefreshChannel } from "../../broker/hooks/brokerRefreshCoordinator";

function getInitialTicket(symbol = "", orderType = "MARKET", limitPrice = "") {
  return {
    symbol,
    side: "BUY",
    quantity: "10",
    orderType,
    limitPrice,
    stopPrice: "",
    timeInForce: "DAY",
    brokerOrderId: "",
    brokerExecutionMode: "PAPER_BROKER",
    mode: "PAPER_BROKER",
  };
}

function isMarketOpen(market, liveQuote) {
  const marketStatus = String(
    liveQuote?.quote?.marketStatus ||
      liveQuote?.quote?.session ||
      liveQuote?.marketStatus ||
      ""
  )
    .trim()
    .toUpperCase();

  if (["NORMAL", "OPEN", "REGULAR", "TRADING", "CONTINUOUS"].includes(marketStatus)) {
    return true;
  }

  if (
    [
      "AFTER_HOURS",
      "POST_MARKET",
      "PRE_MARKET",
      "CLOSED",
      "HALTED",
      "AUCTION",
      "SUSPENDED",
    ].includes(marketStatus)
  ) {
    return false;
  }

  const normalizedMarket = String(market || "").trim().toUpperCase();
  if (normalizedMarket === "US") {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      minute: "numeric",
      timeZone: "America/New_York",
      weekday: "short",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((part) => [part.type, part.value])
    );
    const day = parts.weekday;
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const totalMinutes = hour * 60 + minute;
    const isWeekday = day && !["Sat", "Sun"].includes(day);
    return Boolean(isWeekday && totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60);
  }

  return false;
}

function resolveLimitReferencePrice(liveQuote, fallbackClose) {
  const candidates = [
    liveQuote?.quote?.last,
    liveQuote?.quote?.close,
    liveQuote?.quote?.previousClose,
    fallbackClose,
  ];
  const resolved = candidates.find((value) => Number.isFinite(Number(value)));
  if (!Number.isFinite(Number(resolved))) {
    return "";
  }
  return Number(resolved).toFixed(2);
}

function buildSubmittedOrderSummary(order = {}, ticket = {}) {
  const symbol = order.symbol || ticket.symbol || "-";
  const side = order.side || ticket.side || "BUY";
  const quantity = order.quantity ?? ticket.quantity ?? "-";
  const orderType = order.orderType || ticket.orderType || "MARKET";
  const brokerOrderId = order.brokerOrderId || null;
  const status = order.status || "SUBMITTED";

  return {
    brokerOrderId,
    detail: `${symbol} ${side} ${quantity} ${orderType}${brokerOrderId ? ` · Broker ID ${brokerOrderId}` : ""}`,
    status,
  };
}

function buildTradeTicketErrorMessage(error, fallbackPreflight = null) {
  const baseMessage = error?.message || "Broker order failed.";
  const preflight = error?.details?.preflight || fallbackPreflight;
  if (!preflight?.checks?.length) {
    return baseMessage;
  }

  if (!/reconciliation is not clean|preflight did not pass/i.test(baseMessage)) {
    return baseMessage;
  }

  const reconciliationCheck = preflight.checks.find(
    (check) =>
      (check?.key === "positionsSynced" || check?.key === "openOrdersSynced") &&
      check?.status !== "PASS"
  ) || preflight.checks.find(
    (check) =>
      check?.key === "positionsSynced" ||
      check?.key === "openOrdersSynced"
  );

  if (!reconciliationCheck?.detail) {
    return baseMessage;
  }

  return `${baseMessage} ${reconciliationCheck.detail}`;
}

export default function useTradingWorkspace(symbol, liveQuote, options = {}) {
  const market = options.market || null;
  const fallbackClose = options.lastClose ?? null;
  const marketOpen = useMemo(() => isMarketOpen(market, liveQuote), [liveQuote, market]);
  const defaultOrderType = marketOpen ? "MARKET" : "LIMIT";
  const defaultLimitPrice = useMemo(
    () => (defaultOrderType === "LIMIT" ? resolveLimitReferencePrice(liveQuote, fallbackClose) : ""),
    [defaultOrderType, fallbackClose, liveQuote]
  );
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [preflight, setPreflight] = useState(null);
  const [ticket, setTicket] = useState(() =>
    getInitialTicket(symbol, defaultOrderType, defaultLimitPrice)
  );
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [recentTimeline, setRecentTimeline] = useState([]);
  const [submissionNotice, setSubmissionNotice] = useState(null);
  const [lastPreflightRefreshAt, setLastPreflightRefreshAt] = useState(0);
  const [hasManualLimitEdit, setHasManualLimitEdit] = useState(false);
  const [hasManualOrderTypeEdit, setHasManualOrderTypeEdit] = useState(false);
  const submitInFlightRef = useRef(false);
  const refreshPromiseRef = useRef(null);
  const preflightRef = useRef(null);
  const lastPreflightRefreshAtRef = useRef(0);
  const ticketLocked = submitting;

  useEffect(() => {
    preflightRef.current = preflight;
  }, [preflight]);

  useEffect(() => {
    lastPreflightRefreshAtRef.current = lastPreflightRefreshAt;
  }, [lastPreflightRefreshAt]);

  useEffect(() => {
    setHasManualLimitEdit(false);
    setHasManualOrderTypeEdit(false);
    setTicket(getInitialTicket(symbol, defaultOrderType, defaultLimitPrice));
  }, [symbol]);

  useEffect(() => {
    if (ticketLocked || ticket.brokerOrderId) {
      return;
    }

    setTicket((current) => {
      if (hasManualOrderTypeEdit) {
        return current;
      }

      const nextLimitPrice =
        defaultOrderType === "LIMIT" && !hasManualLimitEdit ? defaultLimitPrice : current.limitPrice;

      if (
        current.orderType === defaultOrderType &&
        current.limitPrice === nextLimitPrice
      ) {
        return current;
      }

      return {
        ...current,
        orderType: defaultOrderType,
        limitPrice: nextLimitPrice,
      };
    });
  }, [
    defaultLimitPrice,
    defaultOrderType,
    hasManualLimitEdit,
    hasManualOrderTypeEdit,
    ticket.brokerOrderId,
    ticket.orderType,
    ticket.limitPrice,
    ticketLocked,
  ]);

  useEffect(() => {
    if (
      ticketLocked ||
      ticket.brokerOrderId ||
      ticket.orderType !== "LIMIT" ||
      hasManualLimitEdit
    ) {
      return;
    }

    if (!defaultLimitPrice) {
      return;
    }

    setTicket((current) => {
      if (
        current.orderType !== "LIMIT" ||
        current.limitPrice === defaultLimitPrice ||
        hasManualLimitEdit
      ) {
        return current;
      }

      return {
        ...current,
        limitPrice: defaultLimitPrice,
      };
    });
  }, [
    defaultLimitPrice,
    hasManualLimitEdit,
    ticket.brokerOrderId,
    ticket.orderType,
    ticketLocked,
  ]);

  const refresh = useCallback(async ({ forceRefresh = false, includePreflight = false, syncBroker = forceRefresh } = {}) => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const run = async () => {
      const now = Date.now();
      const cachedPreflight = preflightRef.current;
      const shouldRefreshPreflight =
        includePreflight ||
        !cachedPreflight ||
        now - lastPreflightRefreshAtRef.current > 30_000;

      if (syncBroker) {
        await synchronizeBrokerState({
          source: "frontend_trading_workspace_refresh",
        }).catch(() => null);
      }

      const [sessionResult, preflightResult] = await Promise.allSettled([
        getTradingSession({ forceRefresh }),
        shouldRefreshPreflight ? getBrokerPreflight() : Promise.resolve(cachedPreflight),
      ]);

      if (sessionResult.status === "fulfilled") {
        setAccount(sessionResult.value.session?.account || null);
        setOrders(sessionResult.value.session?.orders || []);
      } else {
        throw sessionResult.reason;
      }

      if (preflightResult.status === "fulfilled" && preflightResult.value) {
        preflightRef.current = preflightResult.value;
        lastPreflightRefreshAtRef.current = now;
        setPreflight(preflightResult.value);
        setLastPreflightRefreshAt(now);
      }
    };

    refreshPromiseRef.current = run().finally(() => {
      refreshPromiseRef.current = null;
    });

    return refreshPromiseRef.current;
  }, []);

  useEffect(() => {
    return subscribeBrokerRefreshChannel(
      "trading-workspace-session",
      ({ reason }) => {
        const includePreflight = reason !== "scheduled";
        refresh({
          includePreflight,
          forceRefresh: false,
          syncBroker: false,
        }).catch((nextError) => {
          if (reason === "initial") {
            setError(nextError.message);
          }
        });
      },
      {
        immediate: true,
        intervalMs: 5000,
        refreshOnSessionChange: true,
      }
    );
  }, [refresh]);

  const updateTicketField = useCallback(
    (field, value) => {
      if (ticketLocked) {
        return;
      }

      if (field === "orderType") {
        setHasManualOrderTypeEdit(true);
        setHasManualLimitEdit(false);
        setTicket((current) => ({
          ...current,
          orderType: value,
          limitPrice:
            value === "LIMIT"
              ? resolveLimitReferencePrice(liveQuote, fallbackClose) || current.limitPrice
              : current.limitPrice,
        }));
        return;
      }

      if (field === "limitPrice") {
        setHasManualLimitEdit(true);
      }

      setTicket((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [fallbackClose, liveQuote, ticketLocked]
  );

  const previewOrder = useCallback(async () => {
    if (ticketLocked) {
      return;
    }
    setPreviewing(true);
    setError("");
    setSubmissionNotice(null);
    try {
      const payload = await previewManualBrokerOrder({
        ...ticket,
        quantity: Number(ticket.quantity || 0),
        limitPrice: ticket.limitPrice ? Number(ticket.limitPrice) : undefined,
        stopPrice: ticket.stopPrice ? Number(ticket.stopPrice) : undefined,
      });
      setPreview(payload);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPreviewing(false);
    }
  }, [ticket]);

  const submitOrder = useCallback(async () => {
    if (ticketLocked || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    setError("");
    setSubmissionNotice(null);
    try {
      const orderPayload = {
        ...ticket,
        quantity: Number(ticket.quantity || 0),
        limitPrice: ticket.limitPrice ? Number(ticket.limitPrice) : undefined,
        stopPrice: ticket.stopPrice ? Number(ticket.stopPrice) : undefined,
        estimatedNotional:
          Number(ticket.quantity || 0) *
          Number(ticket.limitPrice || liveQuote?.quote?.last || 0),
      };
      const result = ticket.brokerOrderId
        ? await modifyWorkspaceBrokerOrder(orderPayload)
        : await placeManualBrokerOrder(orderPayload);
      const baseOrder = result.order || {};
      const [statusResult, executionsResult, refreshResult] = await Promise.allSettled([
        getWorkspaceBrokerOrderStatus({
          brokerOrderId: baseOrder.brokerOrderId,
          symbol: ticket.symbol,
        }),
        getWorkspaceBrokerExecutions({
          brokerOrderId: baseOrder.brokerOrderId,
          symbol: ticket.symbol,
        }),
        refresh({ forceRefresh: true, includePreflight: true }),
      ]);
      const resolvedOrder =
        statusResult.status === "fulfilled"
          ? statusResult.value?.order || baseOrder
          : baseOrder;
      const executions =
        executionsResult.status === "fulfilled"
          ? executionsResult.value || { fills: [] }
          : { fills: [] };
      const followupWarnings = [];
      if (statusResult.status === "rejected") {
        followupWarnings.push(
          statusResult.reason?.message || "order status is still syncing"
        );
      }
      if (executionsResult.status === "rejected") {
        followupWarnings.push(
          executionsResult.reason?.message || "fill details are still syncing"
        );
      }
      if (refreshResult.status === "rejected") {
        followupWarnings.push(
          refreshResult.reason?.message || "workspace refresh is still syncing"
        );
      }
      setRecentTimeline((current) => [
        {
          id: baseOrder.brokerOrderId || `${ticket.symbol}-${Date.now()}`,
          createdAt: new Date().toISOString(),
          order: resolvedOrder,
          fills: executions?.fills || [],
        },
        ...current,
      ]);
      const submissionSummary = buildSubmittedOrderSummary(resolvedOrder, ticket);
      setSubmissionNotice({
        detail: submissionSummary.detail,
        status: submissionSummary.status,
        tone: followupWarnings.length ? "warning" : "success",
        title: followupWarnings.length
          ? "Order submitted. Broker accepted it, but workspace sync is still catching up."
          : "Order submitted to broker.",
        warning: followupWarnings.join(" "),
      });
      setTicket((current) => ({
        ...current,
        brokerOrderId: baseOrder.brokerOrderId || current.brokerOrderId,
        orderType: resolvedOrder.orderType || baseOrder.orderType || current.orderType,
        limitPrice:
          resolvedOrder.limitPrice != null
            ? String(resolvedOrder.limitPrice)
            : baseOrder.limitPrice != null
              ? String(baseOrder.limitPrice)
            : current.limitPrice,
        stopPrice:
          resolvedOrder.stopPrice != null
            ? String(resolvedOrder.stopPrice)
            : baseOrder.stopPrice != null
              ? String(baseOrder.stopPrice)
            : current.stopPrice,
        quantity:
          resolvedOrder.quantity != null
            ? String(resolvedOrder.quantity)
            : baseOrder.quantity != null
              ? String(baseOrder.quantity)
            : current.quantity,
        side: resolvedOrder.side || baseOrder.side || current.side,
        timeInForce: resolvedOrder.timeInForce || baseOrder.timeInForce || current.timeInForce,
        symbol: resolvedOrder.symbol || baseOrder.symbol || current.symbol,
      }));
    } catch (nextError) {
      if (nextError?.details?.preflight) {
        preflightRef.current = nextError.details.preflight;
        lastPreflightRefreshAtRef.current = Date.now();
        setPreflight(nextError.details.preflight);
        setLastPreflightRefreshAt(Date.now());
      }
      setError(buildTradeTicketErrorMessage(nextError, preflight));
      setSubmissionNotice(null);
    } finally {
      setSubmitting(false);
      submitInFlightRef.current = false;
    }
  }, [liveQuote?.quote?.last, refresh, ticket, ticketLocked]);

  const cancelOrder = useCallback(async (brokerOrderId) => {
    setError("");
    try {
      await cancelWorkspaceBrokerOrder(brokerOrderId);
      await refresh({ forceRefresh: true, includePreflight: true });
    } catch (nextError) {
      setError(nextError.message);
    }
  }, [refresh]);

  const positions = useMemo(() => {
    const livePrice = Number(liveQuote?.quote?.last);
    return (account?.positions || []).map((position) => {
      const currentPrice =
        position.symbol === symbol && Number.isFinite(livePrice)
          ? livePrice
          : Number(position.lastPrice || 0);
      const quantity = Number(position.quantity || 0);
      const averageCost = Number(position.averageCost || 0);
      const marketValue = currentPrice * quantity;
      const unrealizedGain = (currentPrice - averageCost) * quantity;
      const dailyGain =
        position.symbol === symbol && Number.isFinite(Number(liveQuote?.quote?.previousClose))
          ? (currentPrice - Number(liveQuote.quote.previousClose)) * quantity
          : null;
      return {
        ...position,
        currentPrice,
        marketValue,
        unrealizedGain,
        dailyGain,
      };
    });
  }, [account?.positions, liveQuote?.quote?.last, liveQuote?.quote?.previousClose, symbol]);

  return {
    account,
    cancelOrder,
    error,
    loadOrderIntoTicket(order) {
      setHasManualLimitEdit(true);
      setHasManualOrderTypeEdit(true);
      setTicket({
        symbol: order.symbol,
        side: order.side || "BUY",
        quantity: String(order.quantity || ""),
        orderType: order.orderType || "LIMIT",
        limitPrice: order.limitPrice != null ? String(order.limitPrice) : "",
        stopPrice: "",
        timeInForce: "DAY",
        brokerOrderId: order.brokerOrderId || "",
        brokerExecutionMode: "PAPER_BROKER",
        mode: "PAPER_BROKER",
      });
    },
    orders,
    positions,
    preflight,
    preview,
    previewOrder,
    previewing,
    recentTimeline,
    refresh,
    submissionNotice,
    submitOrder,
    submitting,
    ticket,
    ticketLocked,
    updateTicketField,
  };
}
