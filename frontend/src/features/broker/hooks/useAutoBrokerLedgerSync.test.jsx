import "@testing-library/jest-dom/vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAutoBrokerLedgerSync, {
  __resetAutoBrokerLedgerSyncForTests,
} from "./useAutoBrokerLedgerSync";

describe("useAutoBrokerLedgerSync", () => {
  beforeEach(() => {
    __resetAutoBrokerLedgerSyncForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetAutoBrokerLedgerSyncForTests();
  });

  it("automatically starts reconciliation when drift is detected", async () => {
    const requestSync = vi.fn().mockResolvedValue({
      reconciliation: { status: "CLEAN", syncScore: 100 },
    });

    const { result } = renderHook(() =>
      useAutoBrokerLedgerSync({
        enabled: true,
        provider: "MOOMOO",
        reconciliation: {
          status: "WARNING",
          syncScore: 67,
          lastChecked: "2026-07-07T12:00:00.000Z",
        },
        requestSync,
      })
    );

    await waitFor(() => {
      expect(requestSync).toHaveBeenCalledTimes(1);
      expect(result.current.syncState.status).toBe("SUCCESS");
    });
  });

  it("runs only one sync job at a time even when multiple consumers detect the same drift", async () => {
    let resolveSync;
    const requestSync = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        })
    );

    const first = renderHook(() =>
      useAutoBrokerLedgerSync({
        enabled: true,
        provider: "MOOMOO",
        reconciliation: {
          status: "WARNING",
          syncScore: 82,
          lastChecked: "2026-07-07T12:00:00.000Z",
        },
        requestSync,
      })
    );

    renderHook(() =>
      useAutoBrokerLedgerSync({
        enabled: true,
        provider: "MOOMOO",
        reconciliation: {
          status: "WARNING",
          syncScore: 82,
          lastChecked: "2026-07-07T12:00:00.000Z",
        },
        requestSync,
      })
    );

    await waitFor(() => {
      expect(requestSync).toHaveBeenCalledTimes(1);
      expect(first.result.current.isSyncing).toBe(true);
    });

    await act(async () => {
      resolveSync?.({
        reconciliation: { status: "CLEAN", syncScore: 100 },
      });
    });

    await waitFor(() => {
      expect(first.result.current.syncState.status).toBe("SUCCESS");
    });
  });

  it("keeps failed state visible and allows a manual retry", async () => {
    const requestSync = vi
      .fn()
      .mockRejectedValueOnce(new Error("Sync failed"))
      .mockResolvedValueOnce({
        reconciliation: { status: "CLEAN", syncScore: 100 },
      });

    const { result } = renderHook(() =>
      useAutoBrokerLedgerSync({
        enabled: true,
        provider: "MOOMOO",
        reconciliation: {
          status: "CLEAN",
          syncScore: 100,
          lastChecked: "2026-07-07T12:00:00.000Z",
        },
        requestSync,
      })
    );

    await act(async () => {
      await result.current
        .requestLedgerSync({
          force: true,
          reason: "manual retry after auto-sync failure",
        })
        .catch(() => {});
    });

    await waitFor(() => {
      expect(result.current.syncState.status).toBe("FAILED");
      expect(result.current.syncState.error).toBe("Sync failed");
    });

    await act(async () => {
      await result.current.requestLedgerSync({
        force: true,
        reason: "manual retry after auto-sync failure",
      });
    });

    await waitFor(() => {
      expect(requestSync).toHaveBeenCalledTimes(2);
      expect(result.current.syncState.status).toBe("SUCCESS");
    });
  });
});
