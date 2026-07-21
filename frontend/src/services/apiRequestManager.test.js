import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiRequestManagerForTests,
  apiRequest,
  getApiRequestDiagnostics,
  REQUEST_PRIORITY,
  subscribeApiRequest,
} from "./apiRequestManager";
import { __resetApiClientTestState } from "./apiClient";

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  __resetApiRequestManagerForTests();
  __resetApiClientTestState();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("deduplicates identical in-flight GET requests", async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = apiRequest("/api/test");
    const second = apiRequest("/api/test");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveFetch(jsonResponse({ value: 1 }));

    await expect(first).resolves.toEqual({ value: 1 });
    await expect(second).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getApiRequestDiagnostics().dedupedRequests).toBe(1);
  });

  it("returns stale data immediately and revalidates in the background", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ value: 1 }))
      .mockResolvedValueOnce(jsonResponse({ value: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const updates = [];
    const unsubscribe = subscribeApiRequest("GET:/api/test:", (data) => updates.push(data));

    await apiRequest("/api/test", { cacheTtl: 10, staleTtl: 1_000 });
    await vi.advanceTimersByTimeAsync(20);
    await expect(apiRequest("/api/test", { cacheTtl: 10, staleTtl: 1_000 }))
      .resolves.toEqual({ value: 1 });
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toEqual({ value: 2 });
    unsubscribe();
  });

  it("respects Retry-After before retrying a 429", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "slow down" }, 429, { "Retry-After": "1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/api/test");
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toEqual({ ok: true });
    expect(getApiRequestDiagnostics().backoffs429).toBe(1);
  });

  it("runs queued high-priority work before low-priority work", async () => {
    const resolvers = [];
    const starts = [];
    vi.stubGlobal("fetch", vi.fn((url) => {
      starts.push(url);
      if (starts.length > 6) return Promise.resolve(jsonResponse({ url }));
      return new Promise((resolve) => resolvers.push(() => resolve(jsonResponse({ url }))));
    }));

    const blockers = Array.from({ length: 6 }, (_, index) =>
      apiRequest(`/api/block-${index}`, { forceRefresh: true })
    );
    const low = apiRequest("/api/low", {
      forceRefresh: true,
      priority: REQUEST_PRIORITY.LOW,
    });
    const high = apiRequest("/api/high", {
      forceRefresh: true,
      priority: REQUEST_PRIORITY.HIGH,
    });
    await vi.waitFor(() => expect(starts).toHaveLength(6));
    resolvers.shift()();
    await vi.waitFor(() => expect(starts).toContain("/api/high"));
    await vi.waitFor(() => expect(starts).toContain("/api/low"));
    expect(starts.indexOf("/api/high")).toBeLessThan(starts.indexOf("/api/low"));

    while (resolvers.length) resolvers.shift()();
    await Promise.all([...blockers, high, low]);
  });

  it("limits concurrent low-priority requests", async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => {
      if (fetchMock.mock.calls.length > 2) return Promise.resolve(jsonResponse({ ok: true }));
      return new Promise((resolve) => {
        resolvers.push(() => resolve(jsonResponse({ ok: true })));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const requests = Array.from({ length: 4 }, (_, index) =>
      apiRequest(`/api/low-${index}`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.LOW,
      })
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers.shift()();
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    while (resolvers.length) resolvers.shift()();
    await Promise.all(requests);
  });

  it("cancels an older request in the same stale-request group", async () => {
    const aborted = [];
    const fetchMock = vi.fn((url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          aborted.push(url);
          reject(new DOMException("Request aborted", "AbortError"));
        });
        if (String(url).includes("new")) resolve(jsonResponse({ current: true }));
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const stale = apiRequest("/api/old", {
      cancelGroup: "preview",
      forceRefresh: true,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const current = apiRequest("/api/new", {
      cancelGroup: "preview",
      forceRefresh: true,
    });

    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await expect(current).resolves.toEqual({ current: true });
    expect(aborted).toEqual(["/api/old"]);
    expect(getApiRequestDiagnostics().cancelledRequests).toBe(1);
  });
});
