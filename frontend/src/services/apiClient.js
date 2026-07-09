export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

let refreshPromise = null;
let protectedRequestsBlocked = false;
let csrfTokenPromise = null;
let csrfTokenCache = null;

function isApiRequest(input) {
  const url = typeof input === "string" ? input : input?.url || "";
  return url.startsWith(API_BASE_URL) || url.startsWith("/api/");
}

function isSessionEndpoint(url) {
  return [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/me",
    "/api/auth/refresh",
    "/api/auth/logout",
  ].some((path) => url.includes(path));
}

function isPublicApiEndpoint(url) {
  return ["/api/demo/"].some((path) => url.includes(path));
}

function isAuthEntryEndpoint(url) {
  return ["/api/auth/login", "/api/auth/register"].some((path) =>
    url.includes(path)
  );
}

function isUnsafeMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(
    String(method || "GET").toUpperCase()
  );
}

function buildBlockedAuthResponse() {
  return new Response(JSON.stringify({ error: "Authentication required." }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function emitDataSource(response, url) {
  const dataSource = response.headers.get("X-Data-Source");

  if (!dataSource) return;

  window.dispatchEvent(
    new CustomEvent("trading-dashboard:data-source", {
      detail: {
        dataSource,
        degradedMode: response.headers.get("X-Degraded-Mode") === "true",
        url,
      },
    })
  );
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = window
      .fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
      .then((response) => response.ok)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function fetchCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = window
      .fetch(`${API_BASE_URL}/api/auth/csrf`, {
        credentials: "include",
      })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.csrfToken) {
          throw new Error(payload?.error || "Unable to fetch CSRF token.");
        }
        csrfTokenCache = payload.csrfToken;
        return csrfTokenCache;
      })
      .finally(() => {
        csrfTokenPromise = null;
      });
  }

  return csrfTokenPromise;
}

async function withCsrfHeader(url, options) {
  if (!isApiRequest(url) || !isUnsafeMethod(options.method) || isSessionEndpoint(url)) {
    return options;
  }

  const token = csrfTokenCache || (await fetchCsrfToken());
  const headers = new Headers(options.headers || {});
  if (!headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", token);
  }
  return {
    ...options,
    headers,
  };
}

export function clearApiSessionState() {
  protectedRequestsBlocked = false;
  refreshPromise = null;
  csrfTokenCache = null;
  csrfTokenPromise = null;
}

export function __resetApiClientTestState() {
  refreshPromise = null;
  protectedRequestsBlocked = false;
  csrfTokenPromise = null;
  csrfTokenCache = null;
}

/**
 * Credentialed API transport with one automatic refresh retry.
 * @param {RequestInfo | URL} input
 * @param {RequestInit & { skipAuthRefresh?: boolean }} init
 * @returns {Promise<Response>}
 */
export async function apiFetch(input, init = {}) {
  const { skipAuthRefresh = false, ...requestInit } = init;
  const url = typeof input === "string" ? input : input?.url || "";
  const apiRequest = isApiRequest(input);

  if (apiRequest && protectedRequestsBlocked && !isSessionEndpoint(url) && !isPublicApiEndpoint(url)) {
    return buildBlockedAuthResponse();
  }

  const baseOptions = apiRequest
    ? { ...requestInit, credentials: "include" }
    : requestInit;
  const options = apiRequest
    ? await withCsrfHeader(url, baseOptions)
    : baseOptions;
  let response = await window.fetch(input, options);

  if (apiRequest && isAuthEntryEndpoint(url) && response.ok) {
    protectedRequestsBlocked = false;
  }

  if (
    apiRequest &&
    response.status === 403 &&
    isUnsafeMethod(options.method) &&
    !skipAuthRefresh
  ) {
      const payload = await response.clone().json().catch(() => null);
    if ((payload?.error || "").toLowerCase().includes("csrf")) {
      csrfTokenCache = null;
      const retryOptions = await withCsrfHeader(url, baseOptions);
      response = await window.fetch(input, retryOptions);
    }
  }

  if (
    apiRequest &&
    response.status === 401 &&
    !skipAuthRefresh &&
    !isSessionEndpoint(url) &&
    !isPublicApiEndpoint(url)
  ) {
    const refreshed = await refreshSession();

    if (refreshed) {
      protectedRequestsBlocked = false;
      csrfTokenCache = null;
      const retryOptions = await withCsrfHeader(url, baseOptions);
      response = await window.fetch(input, retryOptions);
    } else {
      protectedRequestsBlocked = true;
      window.dispatchEvent(
        new CustomEvent("trading-dashboard:auth-expired")
      );
    }
  }

  if (apiRequest) {
    emitDataSource(response, url);
  }

  return response;
}

export async function readJson(response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed.");
    error.status = response.status;
    error.requestId = payload?.requestId || response.headers.get("X-Request-Id");
    error.payload = payload;
    throw error;
  }

  return payload;
}
