import { API_BASE_URL, apiFetch } from "../../../services/apiClient";

const READ_CACHE_TTL_MS = 1500;
const readCache = new Map();
const forceRefreshPromises = new Map();

function ensureBrokerCacheLifecycleListeners() {
  if (typeof window === "undefined") return;

  window.__TRADING_DASHBOARD_BROKER_CACHE_INVALIDATE__ = () => {
    readCache.clear();
    forceRefreshPromises.clear();
  };

  if (window.__TRADING_DASHBOARD_BROKER_CACHE_LIFECYCLE_BOUND__) return;

  const invalidate = () => {
    window.__TRADING_DASHBOARD_BROKER_CACHE_INVALIDATE__?.();
  };

  window.addEventListener("trading-dashboard:trading-session-changed", invalidate);
  window.addEventListener("trading-dashboard:broker-reconciliation-synced", invalidate);
  window.addEventListener("trading-dashboard:logout", invalidate);
  window.__TRADING_DASHBOARD_BROKER_CACHE_LIFECYCLE_BOUND__ = true;
}

ensureBrokerCacheLifecycleListeners();

function buildReadCacheKey(path) {
  return `GET:${path}`;
}

function clearBrokerReadCache() {
  readCache.clear();
  forceRefreshPromises.clear();
}

function getCachedBrokerRead(path) {
  const key = buildReadCacheKey(path);
  const now = Date.now();
  const entry = readCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.promise) {
    return entry.promise;
  }

  if (entry.expiresAt > now) {
    return Promise.resolve(entry.data);
  }

  readCache.delete(key);
  return null;
}

function setCachedBrokerRead(path, payload) {
  readCache.set(buildReadCacheKey(path), {
    data: payload,
    expiresAt: Date.now() + READ_CACHE_TTL_MS,
    promise: null,
  });
  return payload;
}

function setCachedBrokerReadPromise(path, promise) {
  const key = buildReadCacheKey(path);
  readCache.set(key, {
    data: null,
    expiresAt: 0,
    promise,
  });

  promise
    .then((payload) => {
      setCachedBrokerRead(path, payload);
    })
    .catch(() => {
      const current = readCache.get(key);
      if (current?.promise === promise) {
        readCache.delete(key);
      }
    });

  return promise;
}

async function brokerReadRequest(path, options = {}) {
  const { forceRefresh = false } = options;
  const key = buildReadCacheKey(path);

  if (!forceRefresh) {
    const cached = getCachedBrokerRead(path);
    if (cached) {
      return cached;
    }
  } else {
    const inFlightRefresh = forceRefreshPromises.get(key);
    if (inFlightRefresh) {
      return inFlightRefresh;
    }
    readCache.delete(key);
  }

  const promise = brokerRequest(path);
  const cachedPromise = setCachedBrokerReadPromise(path, promise);
  if (!forceRefresh) {
    return cachedPromise;
  }

  forceRefreshPromises.set(
    key,
    cachedPromise.finally(() => {
      if (forceRefreshPromises.get(key) === cachedPromise) {
        forceRefreshPromises.delete(key);
      }
    })
  );
  return forceRefreshPromises.get(key);
}

export async function brokerRequest(path, options) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Broker request failed: ${path}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export const getBrokerHealth = ({ forceRefresh = false } = {}) =>
  brokerReadRequest("/api/broker/health", { forceRefresh });
export const getBrokerConfig = (provider) =>
  brokerRequest(`/api/broker/config?provider=${encodeURIComponent(provider)}`);
export const getBrokerAccounts = (provider) =>
  brokerRequest(`/api/broker/accounts?provider=${encodeURIComponent(provider)}`);
export const getBrokerSecretStatus = (provider) =>
  brokerRequest(`/api/broker/secret-status?provider=${encodeURIComponent(provider)}`);
export const saveBrokerSecrets = (provider, secrets) =>
  brokerRequest("/api/broker/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, secrets }),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const synchronizeBrokerState = (payload = {}) =>
  brokerRequest("/api/broker/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const saveSelectedBrokerConfig = (provider, config, executionMode) =>
  brokerRequest("/api/broker/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, config, executionMode }),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const getBrokerAccount = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(`/api/broker/account${forceRefresh ? "?refresh=1" : ""}`, {
    forceRefresh,
  });
export const getTradingSession = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(`/api/trading/session${forceRefresh ? "?refresh=1" : ""}`, {
    forceRefresh,
  });
export const getBrokerCapabilities = () => brokerRequest("/api/broker/capabilities");
export const getBrokerReconciliation = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(
    `/api/broker/reconciliation${forceRefresh ? "?refresh=1" : ""}`,
    { forceRefresh }
  );
export const syncBrokerLedger = () =>
  brokerRequest("/api/broker/reconciliation/sync-ledger", {
    method: "POST",
  }).finally(() => {
    clearBrokerReadCache();
  });
export const getBrokerLogs = ({ forceRefresh = false } = {}) =>
  brokerReadRequest("/api/broker/logs", { forceRefresh });
export const getBrokerPreflight = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(`/api/broker/preflight${forceRefresh ? "?refresh=1" : ""}`, {
    forceRefresh,
  });
export const getBrokerOrders = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(`/api/broker/orders${forceRefresh ? "?refresh=1" : ""}`, {
    forceRefresh,
  });
export const getBrokerFills = ({ forceRefresh = false } = {}) =>
  brokerReadRequest(`/api/broker/fills${forceRefresh ? "?refresh=1" : ""}`, {
    forceRefresh,
  });
export const previewBrokerPaperOrder = (approvalId) =>
  brokerRequest("/api/broker/preview-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId }),
  });
export const executeBrokerPaperOrder = (approvalId, payload = {}) =>
  brokerRequest("/api/broker/execute-paper-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, ...payload }),
  });
export const syncBrokerOrder = (id) =>
  brokerRequest(`/api/broker/orders/${id}/sync`, {
    method: "POST",
  }).finally(() => {
    clearBrokerReadCache();
  });
export const markBrokerOrderCancelled = (id, payload = {}) =>
  brokerRequest(`/api/broker/orders/${id}/mark-cancelled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const importBrokerOrder = (payload) =>
  brokerRequest("/api/broker/orders/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const cancelBrokerOrder = (id) =>
  brokerRequest(`/api/broker/orders/${id}/cancel`, {
    method: "POST",
  }).finally(() => {
    clearBrokerReadCache();
  });
export const previewManualBrokerOrder = (payload) =>
  brokerRequest("/api/broker/preview-manual-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const placeManualBrokerOrder = (payload) =>
  brokerRequest("/api/broker/place-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const cancelWorkspaceBrokerOrder = (brokerOrderId) =>
  brokerRequest("/api/broker/workspace-order/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brokerOrderId }),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const modifyWorkspaceBrokerOrder = (payload) =>
  brokerRequest("/api/broker/workspace-order/modify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).finally(() => {
    clearBrokerReadCache();
  });
export const getWorkspaceBrokerOrderStatus = (query) =>
  brokerRequest(
    `/api/broker/workspace-order/status?${new URLSearchParams(query).toString()}`
  );
export const getWorkspaceBrokerExecutions = (query) =>
  brokerRequest(
    `/api/broker/workspace-order/executions?${new URLSearchParams(query).toString()}`
  );

export { clearBrokerReadCache };
