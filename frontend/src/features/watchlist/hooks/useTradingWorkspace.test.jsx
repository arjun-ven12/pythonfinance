import "@testing-library/jest-dom/vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useTradingWorkspace from "./useTradingWorkspace";

const brokerApiMocks = vi.hoisted(() => ({
  cancelWorkspaceBrokerOrder: vi.fn(),
  getBrokerPreflight: vi.fn(),
  getTradingSession: vi.fn(),
  getWorkspaceBrokerExecutions: vi.fn(),
  getWorkspaceBrokerOrderStatus: vi.fn(),
  modifyWorkspaceBrokerOrder: vi.fn(),
  placeManualBrokerOrder: vi.fn(),
  previewManualBrokerOrder: vi.fn(),
  synchronizeBrokerState: vi.fn(),
}));

vi.mock("../../broker/hooks/brokerApi", () => brokerApiMocks);

describe("useTradingWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    brokerApiMocks.getTradingSession.mockResolvedValue({
      session: {
        account: {
          buyingPower: 50000,
          positions: [],
          openOrders: [],
        },
        orders: [],
      },
    });
    brokerApiMocks.getBrokerPreflight.mockResolvedValue({ overall: "READY" });
    brokerApiMocks.previewManualBrokerOrder.mockResolvedValue({});
    brokerApiMocks.placeManualBrokerOrder.mockResolvedValue({
      order: {
        brokerOrderId: "broker-1",
        symbol: "AMD",
        side: "BUY",
        quantity: 10,
        orderType: "MARKET",
      },
    });
    brokerApiMocks.modifyWorkspaceBrokerOrder.mockResolvedValue({
      order: {
        brokerOrderId: "broker-1",
        symbol: "AMD",
        side: "BUY",
        quantity: 10,
        orderType: "LIMIT",
        limitPrice: 188.44,
      },
    });
    brokerApiMocks.getWorkspaceBrokerOrderStatus.mockResolvedValue({
      order: {
        brokerOrderId: "broker-1",
        status: "SUBMITTED",
      },
    });
    brokerApiMocks.getWorkspaceBrokerExecutions.mockResolvedValue({ fills: [] });
    brokerApiMocks.cancelWorkspaceBrokerOrder.mockResolvedValue({});
    vi.spyOn(window, "setInterval");
  });

  function renderWorkspace({
    liveQuote = null,
    market = "US",
    lastClose = 180.12,
    symbol = "AMD",
  } = {}) {
    return renderHook(
      ({ currentLiveQuote, currentMarket, currentLastClose, currentSymbol }) =>
        useTradingWorkspace(currentSymbol, currentLiveQuote, {
          market: currentMarket,
          lastClose: currentLastClose,
        }),
      {
        initialProps: {
          currentLiveQuote: liveQuote,
          currentMarket: market,
          currentLastClose: lastClose,
          currentSymbol: symbol,
        },
      }
    );
  }

  it("defaults to market orders during open market hours", async () => {
    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("MARKET");
    });
    expect(result.current.ticket.limitPrice).toBe("");
  });

  it("defaults to limit orders outside market hours and auto-fills limit price", async () => {
    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "AFTER_HOURS",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("LIMIT");
    });
    expect(result.current.ticket.limitPrice).toBe("188.44");
  });

  it("respects manual limit price edits when live prices update", async () => {
    const { result, rerender } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "AFTER_HOURS",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.limitPrice).toBe("188.44");
    });

    act(() => {
      result.current.updateTicketField("limitPrice", "190.25");
    });

    rerender({
      currentLiveQuote: {
        quote: {
          last: 191.77,
          marketStatus: "AFTER_HOURS",
        },
      },
      currentMarket: "US",
      currentLastClose: 180.12,
      currentSymbol: "AMD",
    });

    await waitFor(() => {
      expect(result.current.ticket.limitPrice).toBe("190.25");
    });
  });

  it("locks the ticket during submission and keeps executed values on success", async () => {
    let resolveOrder;
    brokerApiMocks.placeManualBrokerOrder.mockReturnValue(
      new Promise((resolve) => {
        resolveOrder = resolve;
      })
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("MARKET");
    });

    act(() => {
      result.current.submitOrder();
    });

    await waitFor(() => {
      expect(result.current.ticketLocked).toBe(true);
    });

    act(() => {
      result.current.updateTicketField("quantity", "25");
    });
    expect(result.current.ticket.quantity).toBe("10");

    await act(async () => {
      resolveOrder({
        order: {
          brokerOrderId: "broker-locked-1",
          symbol: "AMD",
          side: "BUY",
          quantity: 10,
          orderType: "MARKET",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.ticketLocked).toBe(false);
    });
    expect(result.current.ticket.brokerOrderId).toBe("broker-locked-1");
    expect(result.current.ticket.quantity).toBe("10");
  });

  it("reuses the shared refresh channel and refreshes on trading-session change events", async () => {
    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("MARKET");
    });

    expect(window.setInterval).toHaveBeenCalledTimes(1);
    const initialSessionCallCount = brokerApiMocks.getTradingSession.mock.calls.length;

    act(() => {
      window.dispatchEvent(
        new CustomEvent("trading-dashboard:trading-session-changed", {
          detail: { provider: "INTERNAL_PAPER" },
        })
      );
    });

    await waitFor(() => {
      expect(brokerApiMocks.getTradingSession.mock.calls.length).toBeGreaterThan(
        initialSessionCallCount
      );
    });
    expect(brokerApiMocks.synchronizeBrokerState).not.toHaveBeenCalled();
  });

  it("unlocks on failure and preserves entered values", async () => {
    brokerApiMocks.placeManualBrokerOrder.mockRejectedValueOnce(
      new Error("Broker rejected order.")
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "AFTER_HOURS",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("LIMIT");
    });

    act(() => {
      result.current.updateTicketField("quantity", "42");
      result.current.updateTicketField("limitPrice", "187.55");
    });

    await act(async () => {
      await result.current.submitOrder();
    });

    await waitFor(() => {
      expect(result.current.ticketLocked).toBe(false);
    });
    expect(result.current.error).toBe("Broker rejected order.");
    expect(result.current.ticket.quantity).toBe("42");
    expect(result.current.ticket.limitPrice).toBe("187.55");
  });

  it("prevents duplicate concurrent submissions", async () => {
    let resolveOrder;
    brokerApiMocks.placeManualBrokerOrder.mockReturnValue(
      new Promise((resolve) => {
        resolveOrder = resolve;
      })
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("MARKET");
    });

    act(() => {
      result.current.submitOrder();
      result.current.submitOrder();
      result.current.submitOrder();
    });

    expect(brokerApiMocks.placeManualBrokerOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveOrder({
        order: {
          brokerOrderId: "broker-1",
          symbol: "AMD",
          side: "BUY",
          quantity: 10,
          orderType: "MARKET",
        },
      });
    });
  });

  it("keeps a submitted confirmation visible even when post-submit sync follow-up fails", async () => {
    brokerApiMocks.placeManualBrokerOrder.mockResolvedValueOnce({
      order: {
        brokerOrderId: "broker-confirm-1",
        symbol: "AMD",
        side: "BUY",
        quantity: 10,
        orderType: "MARKET",
        status: "SUBMITTED",
      },
    });
    brokerApiMocks.getWorkspaceBrokerOrderStatus.mockRejectedValueOnce(
      new Error("Paper broker execution blocked: broker reconciliation is not clean.")
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await waitFor(() => {
      expect(result.current.ticket.orderType).toBe("MARKET");
    });

    await act(async () => {
      await result.current.submitOrder();
    });

    expect(result.current.error).toBe("");
    expect(result.current.submissionNotice?.title).toMatch(/Order submitted/i);
    expect(result.current.submissionNotice?.detail).toContain("Broker ID broker-confirm-1");
    expect(result.current.submissionNotice?.warning).toMatch(/reconciliation is not clean/i);
  });

  it("surfaces reconciliation detail when the broker blocks submission before placement", async () => {
    brokerApiMocks.placeManualBrokerOrder.mockRejectedValueOnce(
      Object.assign(new Error("Paper broker execution blocked: broker reconciliation is not clean."), {
        details: {
          preflight: {
            checks: [
              {
                key: "positionsSynced",
                detail: "Reconciliation status: BLOCKED.",
              },
            ],
          },
        },
      })
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await act(async () => {
      await result.current.submitOrder();
    });

    expect(result.current.error).toContain("broker reconciliation is not clean");
    expect(result.current.error).toContain("Reconciliation status: BLOCKED.");
  });

  it("prefers the non-pass open-order reconciliation detail over a clean positions detail", async () => {
    brokerApiMocks.placeManualBrokerOrder.mockRejectedValueOnce(
      Object.assign(new Error("Paper broker execution blocked: broker reconciliation is not clean."), {
        details: {
          preflight: {
            checks: [
              {
                key: "positionsSynced",
                status: "PASS",
                detail: "Reconciliation status: CLEAN.",
              },
              {
                key: "openOrdersSynced",
                status: "WARNING",
                detail: "2 broker/app open order mismatches still need review.",
              },
            ],
          },
        },
      })
    );

    const { result } = renderWorkspace({
      liveQuote: {
        quote: {
          last: 188.44,
          marketStatus: "NORMAL",
        },
      },
    });

    await act(async () => {
      await result.current.submitOrder();
    });

    expect(result.current.error).toContain("broker reconciliation is not clean");
    expect(result.current.error).toContain("2 broker/app open order mismatches still need review.");
    expect(result.current.error).not.toContain("Reconciliation status: CLEAN.");
  });
});
