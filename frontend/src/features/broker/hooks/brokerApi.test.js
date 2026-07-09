import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();

vi.mock("../../../services/apiClient", () => ({
  API_BASE_URL: "http://localhost:3000",
  apiFetch: (...args) => apiFetchMock(...args),
}));

describe("brokerApi read dedupe", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  afterEach(async () => {
    vi.resetModules();
  });

  it("dedupes identical concurrent trading-session reads", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { provider: "MOOMOO" } }),
    });

    const brokerApi = await import("./brokerApi");

    const [first, second] = await Promise.all([
      brokerApi.getTradingSession(),
      brokerApi.getTradingSession(),
    ]);

    expect(first).toEqual({ session: { provider: "MOOMOO" } });
    expect(second).toEqual({ session: { provider: "MOOMOO" } });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses cached reads on force refresh", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "MOOMOO", version: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "MOOMOO", version: 2 } }),
      });

    const brokerApi = await import("./brokerApi");

    const initial = await brokerApi.getTradingSession();
    const refreshed = await brokerApi.getTradingSession({ forceRefresh: true });

    expect(initial.session.version).toBe(1);
    expect(refreshed.session.version).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes identical concurrent force-refresh reads", async () => {
    let resolveResponse;
    apiFetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      })
    );

    const brokerApi = await import("./brokerApi");

    const firstPromise = brokerApi.getTradingSession({ forceRefresh: true });
    const secondPromise = brokerApi.getTradingSession({ forceRefresh: true });

    resolveResponse({
      ok: true,
      json: async () => ({ session: { provider: "MOOMOO", version: 7 } }),
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.session.version).toBe(7);
    expect(second.session.version).toBe(7);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears cached reads after an explicit broker synchronization", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "MOOMOO", version: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ synchronized: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "MOOMOO", version: 2 } }),
      });

    const brokerApi = await import("./brokerApi");

    const initial = await brokerApi.getTradingSession();
    await brokerApi.synchronizeBrokerState({ source: "test_sync" });
    const refreshed = await brokerApi.getTradingSession();

    expect(initial.session.version).toBe(1);
    expect(refreshed.session.version).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears cached reads when the trading session changes", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "MOOMOO", version: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: { provider: "INTERNAL_PAPER", version: 2 } }),
      });

    const brokerApi = await import("./brokerApi");

    const initial = await brokerApi.getTradingSession();
    window.dispatchEvent(
      new CustomEvent("trading-dashboard:trading-session-changed", {
        detail: { provider: "INTERNAL_PAPER" },
      })
    );
    const refreshed = await brokerApi.getTradingSession();

    expect(initial.session.version).toBe(1);
    expect(refreshed.session.version).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
