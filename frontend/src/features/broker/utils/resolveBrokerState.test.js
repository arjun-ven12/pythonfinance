import { describe, expect, it } from "vitest";
import { resolveBrokerState } from "./resolveBrokerState";

describe("resolveBrokerState", () => {
  it("normalizes broker session and account data into one shared broker state", () => {
    const brokerState = resolveBrokerState({
      activeBrokerAccount: {
        provider: "MOOMOO",
        cash: 9000,
        buyingPower: 8000,
        availableFunds: 7500,
        equity: 12000,
        positions: [{ symbol: "SHOULD_NOT_WIN" }],
        openOrders: [{ brokerOrderId: "acct-open-1", status: "OPEN" }],
      },
      activeTradingSession: {
        provider: "MOOMOO",
        balances: {
          cash: 9100,
          buyingPower: 8200,
          availableFunds: 7600,
          equity: 12100,
          margin: 200,
          currency: "USD",
        },
        account: {
          accountType: "SIMULATE",
        },
        positions: [{ symbol: "AMD" }],
        orders: [
          { brokerOrderId: "open-1", status: "OPEN" },
          { brokerOrderId: "filled-1", status: "FILLED" },
        ],
      },
    });

    expect(brokerState.provider).toBe("MOOMOO");
    expect(brokerState.isBrokerProvider).toBe(true);
    expect(brokerState.isInternalPaperMode).toBe(false);
    expect(brokerState.account.cash).toBe(9000);
    expect(brokerState.balances.cash).toBe(9100);
    expect(brokerState.balances.buyingPower).toBe(8200);
    expect(brokerState.positions).toEqual([{ symbol: "AMD" }]);
    expect(brokerState.openOrders).toEqual([{ brokerOrderId: "open-1", status: "OPEN" }]);
    expect(brokerState.inactiveOrders).toEqual([
      { brokerOrderId: "filled-1", status: "FILLED" },
    ]);
  });
});
