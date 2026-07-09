import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useAuth from "./useAuth";

const API_BASE_URL = "http://localhost:3000";

function response({ body = null, ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
  };
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  it("logs in with cookies and never stores a JWT", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/api/auth/me")) {
        return response({ ok: false, status: 401 });
      }
      if (url.endsWith("/api/auth/refresh")) {
        return response({ ok: false, status: 401 });
      }
      return response({
        body: {
          user: {
            id: "user-1",
            name: "Trader",
            email: "trader@example.com",
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAuth(API_BASE_URL));

    await waitFor(() => expect(result.current.isChecked).toBe(true));
    act(() => {
      result.current.updateForm("email", "trader@example.com");
      result.current.updateForm("password", "StrongPassword12!");
    });
    await act(async () => {
      await result.current.submit({ preventDefault: vi.fn() });
    });

    expect(window.localStorage.length).toBe(0);
    expect(window.localStorage.getItem("tradingDashboardAccessToken")).toBeNull();
    expect(window.localStorage.getItem("tradingDashboardJwt")).toBeNull();
    expect(result.current.user.email).toBe("trader@example.com");
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.credentials === "include")
    ).toBe(true);
  });

  it("returns to signed-out state when access and refresh sessions are invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ok: false, status: 401 }))
    );
    const { result } = renderHook(() => useAuth(API_BASE_URL));

    await waitFor(() => {
      expect(result.current.isChecked).toBe(true);
      expect(result.current.user).toBeNull();
    });

    expect(window.localStorage.getItem("tradingDashboardJwt")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("logout clears legacy auth-related localStorage keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(response({ ok: false, status: 401 }))
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: new Headers(),
          json: async () => null,
        })
    );
    window.localStorage.setItem("tradingDashboardUserId", "old-user");
    window.localStorage.setItem("tradingDashboardAccessToken", "old-token");
    window.localStorage.setItem("tradingDashboardJwt", "old-jwt");

    const { result } = renderHook(() => useAuth(API_BASE_URL));

    await waitFor(() => expect(result.current.isChecked).toBe(true));
    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem("tradingDashboardUserId")).toBeNull();
    expect(window.localStorage.getItem("tradingDashboardAccessToken")).toBeNull();
    expect(window.localStorage.getItem("tradingDashboardJwt")).toBeNull();
  });
});
