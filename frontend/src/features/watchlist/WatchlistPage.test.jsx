import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WatchlistPage from "./WatchlistPage";
import { __resetStockPriceChartTestCache } from "../../components/stocks/StockPriceChart";

function mockJsonResponse(payload) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetStockPriceChartTestCache();
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("opens the shared stock chart in the watchlist workspace modal", async () => {
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
      <WatchlistPage
        formatPercent={(value) => `${value}%`}
        scanWatchlistOnly={false}
        setDetailSymbol={vi.fn()}
        setScanWatchlistOnly={vi.fn()}
        setSelectedSymbol={vi.fn()}
        toggleWatchlist={vi.fn()}
        watchlistError=""
        watchlistItems={[
          {
            symbol: "AMD",
            item: {
              symbol: "AMD",
              display_symbol: "AMD",
              market: "US",
              exchange: "NASDAQ",
              currency: "USD",
              signal: "BUY",
              close: 172.2,
              opportunity_score: 91,
              confidence: 87,
              win_rate: 53,
              drawdown: 12,
              backtest_return: 24,
              buy_and_hold: 18,
              reasons: ["Semiconductor trend still intact."],
            },
          },
        ]}
        watchlistSource="database"
        watchlistSymbols={["AMD"]}
      />
    );

    fireEvent.click(screen.getByText("AMD"));

    expect(await screen.findByText("Price action")).toBeInTheDocument();
    expect(screen.getAllByText("YAHOO_FINANCE").length).toBeGreaterThan(0);
  });
});
