import { apiFetch, readJson } from "./apiClient";

export const REQUEST_PRIORITY = Object.freeze({
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
});

const DEFAULT_CACHE_TTL = 5_000;
const DEFAULT_STALE_TTL = 30_000;
const MAX_CONCURRENT = 6;
const MAX_LOW_PRIORITY_CONCURRENT = 2;

const cache = new Map();
const inFlight = new Map();
const subscribers = new Map();
const queues = [[], [], []];
const cancellationGroups = new Map();
let activeCount = 0;
let activeLowPriorityCount = 0;

const diagnostics = {
  totalRequests: 0,
  networkRequests: 0,
  dedupedRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  backoffs429: 0,
  cancelledRequests: 0,
};

function stableStringify(value) {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function buildRequestKey(url, method, body, key) {
  return key || `${method}:${url}:${stableStringify(body)}`;
}

function parseRetryAfter(value, attempt) {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return Math.min(30_000, 1_000 * (2 ** attempt));
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
}

function emit(key, value) {
  subscribers.get(key)?.forEach((listener) => listener(value));
}

function canRun(priority) {
  return activeCount < MAX_CONCURRENT &&
    (priority !== REQUEST_PRIORITY.LOW || activeLowPriorityCount < MAX_LOW_PRIORITY_CONCURRENT);
}

function drainQueue() {
  for (let priority = 0; priority < queues.length; priority += 1) {
    while (queues[priority].length && canRun(priority)) {
      const task = queues[priority].shift();
      activeCount += 1;
      if (priority === REQUEST_PRIORITY.LOW) activeLowPriorityCount += 1;
      task.run().finally(() => {
        activeCount -= 1;
        if (priority === REQUEST_PRIORITY.LOW) activeLowPriorityCount -= 1;
        drainQueue();
      });
    }
  }
}

function enqueue(priority, run) {
  return new Promise((resolve, reject) => {
    queues[priority].push({
      run: () => run().then(resolve, reject),
    });
    drainQueue();
  });
}

async function executeJsonRequest(url, options, controller) {
  const {
    body,
    headers,
    max429Retries,
    method,
  } = options;
  let attempt = 0;

  while (true) {
    diagnostics.networkRequests += 1;
    const response = await apiFetch(url, {
      method,
      headers,
      body: body === undefined || typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status !== 429 || attempt >= max429Retries) {
      return readJson(response);
    }
    diagnostics.backoffs429 += 1;
    await wait(parseRetryAfter(response.headers.get("Retry-After"), attempt), controller.signal);
    attempt += 1;
  }
}

function startNetworkRequest(url, options, requestKey, { background = false } = {}) {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => {
        diagnostics.cancelledRequests += 1;
        controller.abort();
      }, { once: true });
    }
  }
  if (options.cancelGroup) {
    if (cancellationGroups.get(options.cancelGroup)) {
      diagnostics.cancelledRequests += 1;
      cancellationGroups.get(options.cancelGroup).abort();
    }
    cancellationGroups.set(options.cancelGroup, controller);
  }

  const promise = enqueue(options.priority, () =>
    executeJsonRequest(url, options, controller)
  ).then((data) => {
    if (options.cacheable) {
      cache.set(requestKey, { data, updatedAt: Date.now() });
      emit(requestKey, data);
    }
    return data;
  }).finally(() => {
    if (inFlight.get(requestKey)?.promise === promise) inFlight.delete(requestKey);
    if (options.cancelGroup && cancellationGroups.get(options.cancelGroup) === controller) {
      cancellationGroups.delete(options.cancelGroup);
    }
  });

  inFlight.set(requestKey, { promise, controller, background });
  return promise;
}

export function apiRequest(url, {
  body,
  cacheResponse = false,
  cacheTtl = DEFAULT_CACHE_TTL,
  cancelGroup = "",
  dedupe = true,
  forceRefresh = false,
  headers,
  key,
  max429Retries,
  method = "GET",
  priority = REQUEST_PRIORITY.MEDIUM,
  signal,
  staleTtl = DEFAULT_STALE_TTL,
} = {}) {
  diagnostics.totalRequests += 1;
  const normalizedMethod = String(method).toUpperCase();
  const cacheable = normalizedMethod === "GET" || cacheResponse;
  const requestKey = buildRequestKey(url, normalizedMethod, body, key);
  const options = {
    body,
    cacheable,
    cancelGroup,
    headers,
    max429Retries: max429Retries ?? (cacheable ? 2 : 0),
    method: normalizedMethod,
    priority,
    signal,
  };
  const cached = cache.get(requestKey);
  const age = cached ? Date.now() - cached.updatedAt : Infinity;

  if (cacheable && !forceRefresh && cached && age <= cacheTtl) {
    diagnostics.cacheHits += 1;
    return Promise.resolve(cached.data);
  }
  if (cacheable && !forceRefresh && cached && age <= staleTtl) {
    diagnostics.cacheHits += 1;
    if (!inFlight.has(requestKey)) {
      startNetworkRequest(url, options, requestKey, { background: true }).catch(() => {});
    }
    return Promise.resolve(cached.data);
  }

  diagnostics.cacheMisses += 1;
  if (dedupe && inFlight.has(requestKey)) {
    diagnostics.dedupedRequests += 1;
    return inFlight.get(requestKey).promise;
  }
  return startNetworkRequest(url, options, requestKey);
}

export function invalidateApiCache(match) {
  for (const key of cache.keys()) {
    if (!match || (typeof match === "string" ? key.includes(match) : match.test(key))) {
      cache.delete(key);
    }
  }
}

export function subscribeApiRequest(key, listener) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(listener);
  return () => {
    const listeners = subscribers.get(key);
    listeners?.delete(listener);
    if (!listeners?.size) subscribers.delete(key);
  };
}

export function cancelRequestGroup(group) {
  if (cancellationGroups.get(group)) {
    diagnostics.cancelledRequests += 1;
    cancellationGroups.get(group).abort();
    cancellationGroups.delete(group);
  }
}

export function getApiRequestDiagnostics() {
  return {
    ...diagnostics,
    inFlightRequests: inFlight.size,
    queuedRequests: queues.reduce((total, queue) => total + queue.length, 0),
  };
}

export function __resetApiRequestManagerForTests() {
  inFlight.forEach(({ controller }) => controller.abort());
  cancellationGroups.forEach((controller) => controller.abort());
  cache.clear();
  inFlight.clear();
  subscribers.clear();
  cancellationGroups.clear();
  queues.forEach((queue) => queue.splice(0));
  activeCount = 0;
  activeLowPriorityCount = 0;
  Object.keys(diagnostics).forEach((key) => {
    diagnostics[key] = 0;
  });
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.defineProperty(window, "__API_REQUEST_DIAGNOSTICS__", {
    configurable: true,
    get: getApiRequestDiagnostics,
  });
}
