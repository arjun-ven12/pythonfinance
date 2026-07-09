import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockPriceChart, { __resetStockPriceChartTestCache } from "./StockPriceChart";
import { disconnectMarketData } from "../../features/marketData/services/marketDataService";

function mockJsonResponse(payload, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("StockPriceChart", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    disconnectMarketData();
    __resetStockPriceChartTestCache();
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    global.WebSocket = class {
      static OPEN = 1;
      static CONNECTING = 0;
      constructor() {
        this.readyState = global.WebSocket.OPEN;
      }
      addEventListener() {}
      close() {}
      send() {}
    };
  });

  it("loads delayed chart data and refetches when timeframe changes", async () => {
    const delayedPayload = {
      symbol: "AMD",
      currency: "USD",
      source: "YAHOO_FINANCE",
      isDelayed: true,
      isStale: false,
      providerWarning: "Using Yahoo fallback",
      lastUpdated: "2026-07-01T13:30:00.000Z",
      quote: {
        last: 172.2,
        change: 3.8,
        changePercent: 2.26,
        high: 173.4,
        low: 168.2,
        volume: 44100000,
      },
      points: [
        { timestamp: "2026-06-24T13:30:00.000Z", close: 168.4, high: 169.8, low: 164.9, volume: 39200000 },
        { timestamp: "2026-07-01T13:30:00.000Z", close: 172.2, high: 173.4, low: 168.2, volume: 44100000 },
      ],
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("/price-history")) {
          if (url.includes("timeframe=5m")) {
            return mockJsonResponse({
              ...delayedPayload,
              points: [
                { timestamp: "2026-06-30T13:30:00.000Z", close: 170.4, high: 171.2, low: 169.1, volume: 20500000 },
                { timestamp: "2026-07-01T13:30:00.000Z", close: 172.2, high: 173.4, low: 168.2, volume: 22100000 },
              ],
            });
          }
          return mockJsonResponse(delayedPayload);
        }
        return mockJsonResponse({
          ...delayedPayload,
          points: delayedPayload.points.slice(-1),
        });
      });

    render(<StockPriceChart symbol="AMD" />);

    expect(await screen.findByText("YAHOO_FINANCE")).toBeInTheDocument();
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.getByText("Using Yahoo fallback")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5 Minute" }));

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("timeframe=5m"))).toBe(true);
    });
  });

  it("renders stale/fallback badges honestly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      mockJsonResponse({
        symbol: "AMD",
        currency: "USD",
        source: "SCANNER_CACHE",
        isDelayed: true,
        isStale: true,
        chartUnavailable: true,
        providerWarning: "Only latest scanner price available. Price chart unavailable.",
        lastUpdated: "2026-07-01T13:30:00.000Z",
        quote: {
          last: 172.2,
          change: null,
          changePercent: null,
          high: null,
          low: null,
          volume: 0,
        },
        points: [{ timestamp: "2026-07-01T13:30:00.000Z", close: 172.2, high: 172.2, low: 172.2, volume: 0 }],
      })
    );

    render(<StockPriceChart symbol="AMD" />);

    expect(await screen.findByText("SCANNER_CACHE")).toBeInTheDocument();
    expect(screen.getAllByText("Scanner cache").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Only latest scanner price available/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chart unavailable").length).toBeGreaterThan(0);
  });

  it("shows an unavailable state when the endpoint errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      mockJsonResponse({ error: "Authentication required." }, 401)
    );

    render(<StockPriceChart symbol="AMD" />);

    expect(await screen.findByText("Authentication required.")).toBeInTheDocument();
    expect(screen.getAllByText("Authentication required.").length).toBeGreaterThan(0);
  });

  it("keeps the last valid chart visible when a later history refresh returns empty points", async () => {
    const historyPayload = {
      symbol: "APTV",
      currency: "USD",
      source: "MOOMOO_OPEND",
      isLive: true,
      isDelayed: false,
      lastUpdated: "2026-07-06T13:30:00.000Z",
      quote: {
        last: 59.77,
        change: 0.88,
        changePercent: 1.5,
        bid: 59.76,
        ask: 59.79,
      },
      points: [
        { timestamp: "2026-07-03T13:30:00.000Z", close: 58.89, high: 62.13, low: 57.88, volume: 2246397 },
        { timestamp: "2026-07-06T13:30:00.000Z", close: 59.77, high: 60.25, low: 58.79, volume: 834624 },
      ],
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = String(input);
        if (url.includes("/price-history")) {
          if (url.includes("timeframe=5m")) {
            return mockJsonResponse({
              ...historyPayload,
              lastUpdated: "2026-07-06T13:31:00.000Z",
              quote: {
                ...historyPayload.quote,
                last: 59.79,
                change: 0.9,
                changePercent: 1.53,
                bid: 59.78,
                ask: 59.8,
              },
              points: [],
            });
          }
          return mockJsonResponse(historyPayload);
        }
        return mockJsonResponse({
          ...historyPayload,
          points: historyPayload.points.slice(-1),
        });
      });

    const { rerender } = render(<StockPriceChart symbol="APTV" defaultRange="1d" />);

    expect(await screen.findByText("MOOMOO_OPEND")).toBeInTheDocument();
    expect(screen.queryByText("Chart unavailable")).not.toBeInTheDocument();

    rerender(<StockPriceChart symbol="APTV" defaultRange="5m" />);

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("timeframe=5m"))).toBe(true);
    });

    expect(screen.queryByText("Chart unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Market data unavailable")).not.toBeInTheDocument();
  });
});
