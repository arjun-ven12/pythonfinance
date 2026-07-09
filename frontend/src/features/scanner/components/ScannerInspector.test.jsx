import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScannerInspector from "./ScannerInspector";
import { __resetStockPriceChartTestCache } from "../../../components/stocks/StockPriceChart";

function mockJsonResponse(payload) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("ScannerInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetStockPriceChartTestCache();
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("loads the shared stock chart for the selected scanner stock", async () => {
    vi.spyOn(window, "fetch").mockImplementation(() =>
      mockJsonResponse({
        symbol: "AMD",
        currency: "USD",
        source: "YAHOO_FINANCE",
        isDelayed: true,
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
      })
    );

    render(
      <ScannerInspector
        activeHorizonProfile={{ strategy_bias: "Long" }}
        activeStrategy={{ name: "Momentum Lab v12" }}
        compareItems={[]}
        formatPercent={(value) => `${value}%`}
        isOpen
        onClose={vi.fn()}
        onToggleWatchlist={vi.fn()}
        selectedStock={{
          symbol: "AMD",
          display_symbol: "AMD",
          signal: "BUY",
          market: "US",
          exchange: "NASDAQ",
          currency: "USD",
          opportunity_score: 91,
          confidence: 87,
          win_rate: 53,
          drawdown: 12,
          close: 172.2,
          reasons: ["Trend and volume confirm the move."],
        }}
        watchlist={new Set()}
      />
    );

    expect(await screen.findByText("Price action")).toBeInTheDocument();
    expect(screen.getAllByText("YAHOO_FINANCE").length).toBeGreaterThan(0);
  });
});
