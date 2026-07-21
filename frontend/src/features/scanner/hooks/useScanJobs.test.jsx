import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetApiClientTestState } from "../../../services/apiClient";
import useScanJobs from "./useScanJobs";

function jsonResponse(payload, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("useScanJobs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetApiClientTestState();
  });

  it("submits the current watchlist through the canonical scan endpoint", async () => {
    let submittedBody = null;
    vi.spyOn(window, "fetch").mockImplementation((input, options = {}) => {
      const url = String(input);
      if (url.endsWith("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "test-token" });
      }
      if (url.endsWith("/api/scans/start")) {
        submittedBody = JSON.parse(options.body);
        return jsonResponse({
          job: { id: "scan-1", status: "QUEUED", progress: 0 },
        });
      }
      if (url.endsWith("/api/scans/scan-1")) {
        return jsonResponse({
          job: { id: "scan-1", status: "COMPLETED", progress: 100 },
        });
      }
      if (url.endsWith("/api/scan-results")) {
        return jsonResponse({ opportunities: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const settings = {
      buildExecutionSettingsPayload: () => ({ mode: "paper" }),
      buildMarketUniverseSettingsPayload: () => ({ market: "US" }),
      riskMultiplier: 1,
      scanLimit: 100,
      scanWatchlistOnly: false,
      tradingHorizon: "SWING",
      user: null,
    };
    const { result } = renderHook(() =>
      useScanJobs({
        onScanCompleted: vi.fn(),
        settings,
        watchlist: new Set(["STX", "AMD"]),
      })
    );

    await act(async () => {
      await result.current.runWatchlistScan();
    });

    expect(submittedBody).toMatchObject({
      scanWatchlistOnly: true,
      watchlistSymbols: ["STX", "AMD"],
      requestedCount: 2,
    });
  });
});
