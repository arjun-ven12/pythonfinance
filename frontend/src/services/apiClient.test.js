import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiClientTestState,
  apiFetch,
} from "./apiClient";

function response(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
  };
}

afterEach(() => {
  window.localStorage.clear();
  __resetApiClientTestState();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("includes credentials on API requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/scan-results");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/scan-results",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("does not attach an Authorization header for browser cookie auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/scan-results");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe("include");
    expect(options.headers?.get?.("Authorization") || null).toBeNull();
  });

  it("rotates the refresh cookie once and retries an unauthorized request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("http://localhost:3000/api/scan-results");

    expect(result.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/auth/refresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes the session-bound CSRF token after an auth refresh on unsafe requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "old-token" }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "new-token" }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("http://localhost:3000/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ ok: true }),
    });

    expect(result.status).toBe(200);
    expect(fetchMock.mock.calls[2][0]).toContain("/api/auth/refresh");
    expect(fetchMock.mock.calls[3][0]).toContain("/api/auth/csrf");
    expect(fetchMock.mock.calls[4][1].headers.get("X-CSRF-Token")).toBe(
      "new-token"
    );
  });

  it("fetches and attaches a CSRF token for unsafe API requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "csrf-token" }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/settings", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/csrf");
    const [, options] = fetchMock.mock.calls[1];
    expect(options.headers.get("X-CSRF-Token")).toBe("csrf-token");
  });

  it("retries once with a refreshed CSRF token after a CSRF rejection", async () => {
    const csrfResponse = {
      ok: true,
      status: 200,
      json: async () => ({ csrfToken: "first-token" }),
      headers: new Headers(),
    };
    const nextCsrfResponse = {
      ok: true,
      status: 200,
      json: async () => ({ csrfToken: "second-token" }),
      headers: new Headers(),
    };
    const csrfErrorResponse = new Response(
      JSON.stringify({ error: "Invalid CSRF token." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrfResponse)
      .mockResolvedValueOnce(csrfErrorResponse)
      .mockResolvedValueOnce(nextCsrfResponse)
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("http://localhost:3000/api/settings", {
      method: "PATCH",
    });

    expect(result.status).toBe(200);
    expect(fetchMock.mock.calls[2][0]).toContain("/api/auth/csrf");
    expect(fetchMock.mock.calls[3][1].headers.get("X-CSRF-Token")).toBe(
      "second-token"
    );
  });

  it("does not attempt refresh recursively for login failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/auth/login", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps public demo requests available even when protected requests are blocked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/scan-results");
    const result = await apiFetch("http://localhost:3000/api/demo/dashboard");

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3000/api/demo/dashboard",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
