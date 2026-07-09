import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useDashboard from "./useDashboard";

function createHookProps(overrides = {}) {
  return {
    activeBrokerAccount: null,
    activeTradingSession: null,
    activeStrategyConfig: null,
    alertNeedsAction: [],
    dashboardCounts: {},
    dashboardOpportunities: [],
    data: {},
    dataHealth: {},
    engineStatus: {},
    executionMode: "MANUAL_APPROVAL",
    handleRunScan: vi.fn(),
    horizonSettings: { SWING: { label: "Swing" } },
    ibkrStatus: null,
    paperPortfolio: { equity: 100000, cash: 75000 },
    pendingApprovalRequests: [],
    proposedOrdersData: { orders: [], execution_status: {} },
    riskDashboardData: {
      portfolio: { equity: 88000, cash: 66000 },
      summary: { equity: 88000, cash: 66000 },
    },
    safetyStatus: {},
    setActiveTab: vi.fn(),
    signalThreshold: "60",
    tradingHorizon: "SWING",
    ...overrides,
  };
}

describe("useDashboard broker determinism", () => {
  it("uses broker balances without falling back to paper portfolio values in broker mode", () => {
    const { result } = renderHook(() =>
      useDashboard(
        createHookProps({
          activeTradingSession: {
            provider: "MOOMOO",
            balances: {
              equity: 12345,
              cash: 6789,
              buyingPower: 4321,
              availableFunds: 4000,
              margin: 150,
              currency: "USD",
            },
            account: {
              accountType: "Paper",
              positions: [],
              openOrders: [],
            },
            positions: [],
            openOrders: [],
          },
        })
      )
    );

    expect(result.current.usesBrokerHeadline).toBe(true);
    expect(result.current.portfolioEquity).toBe(12345);
    expect(result.current.portfolioCash).toBe(6789);
    expect(result.current.buyingPower).toBe(4321);
    expect(result.current.availableFunds).toBe(4000);
    expect(result.current.marginValue).toBe(150);
  });
});
