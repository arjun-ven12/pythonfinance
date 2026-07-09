import { describe, expect, it } from "vitest";

import { getTradeAnalytics } from "./tradeAnalytics";

describe("getTradeAnalytics", () => {
  it("prefers trade return percentages over backend pnl summary fields", () => {
    const analytics = getTradeAnalytics({
      settingsJson: {
        result: {
          average_winner: 1634.51,
          average_loser: -411.2,
          largest_winner: 2845.66,
          largest_loser: -567.79,
          profit_factor: 2.39,
        },
        trades: [
          { type: "SELL", return_pct: 1.21, pnl: 185.46, reason: "TRAILING_STOP" },
          { type: "SELL", return_pct: -1.62, pnl: -294.59, reason: "TRAILING_STOP" },
          { type: "SELL", return_pct: 14.57, pnl: 2651.19, reason: "TAKE_PROFIT" },
          { type: "SELL", return_pct: -2.88, pnl: -525.08, reason: "STOP_LOSS" },
        ],
      },
    });

    expect(analytics.averageWinner).toBeCloseTo(7.89, 2);
    expect(analytics.averageLoser).toBeCloseTo(-2.25, 2);
    expect(analytics.largestWinner).toBe(14.57);
    expect(analytics.largestLoser).toBe(-2.88);
    expect(analytics.profitFactor).toBe(2.39);
  });

  it("works with persisted completed trade logs from older runs", () => {
    const analytics = getTradeAnalytics({
      settingsJson: {
        result: {
          completed_trade_log: [
            { return_pct: 9.58, pnl: 1560.34, market_regime: "BULL_LOW_VOL" },
            { return_pct: -2.17, pnl: -434.92, market_regime: "BULL_LOW_VOL" },
          ],
        },
      },
    });

    expect(analytics.averageWinner).toBe(9.58);
    expect(analytics.averageLoser).toBe(-2.17);
    expect(analytics.largestWinner).toBe(9.58);
    expect(analytics.largestLoser).toBe(-2.17);
  });
});
