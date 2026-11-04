import React from "react";
import {
  renderHook,
  render,
  screen,
  fireEvent,
} from "@testing-library/react-native";
import { router } from "expo-router";
import { usePortfolio } from "../src/hooks/usePortfolio";
import { useSession } from "../src/auth/session";
import Portfolio from "../src/screens/Portfolio";
import { LinkRow } from "../src/components/ui";
const mockState = {
  mode: "LIVE_SUPERVISED",
  snapshot: {
    accountId: "real",
    equity: 8765,
    cash: 5000,
    timestamp: new Date().toISOString(),
    positions: [{ symbol: "REAL", quantity: 3 }],
  },
};
const mockOrders = {
  orders: [
    {
      id: "order",
      symbol: "REAL",
      side: "BUY",
      quantity: 3,
      status: "PARTIAL",
      limitPrice: 100,
    },
  ],
};
jest.mock("../src/api/query", () => ({
  useResource: (path: string) => ({
    data:
      path === "/api/execution/status"
        ? { control: { ...mockState, currency: "USD", policy: {} } }
        : path === "/api/broker/orders"
          ? mockOrders
          : path === "/api/paper-portfolio"
            ? { equity: 123, cash: 100, positions: { PAPER: { quantity: 1 } } }
            : undefined,
    isSuccess: true,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  refreshAll: jest.fn(),
}));
beforeEach(() =>
  useSession.setState({
    user: {
      id: "u",
      name: "Test",
      email: "test@example.invalid",
      role: "LEVEL_3_OWNER_ADMIN",
      verificationStatus: "VERIFIED",
      pageAccess: { BROKER: true },
    },
  }),
);
it("live balances and positions never fall back to the paper ledger", async () => {
  const { result } = await renderHook(() => usePortfolio());
  expect(result.current.live).toBe(true);
  expect(result.current.equity).toBe(8765);
  expect(result.current.holdings[0]?.symbol).toBe("REAL");
  expect(result.current.holdings.some((p) => p.symbol === "PAPER")).toBe(false);
});
it("navigation links open the intended Expo Router destination", async () => {
  await render(
    <LinkRow
      title="Automation centre"
      detail="Server controls"
      to="/automation"
    />,
  );
  await fireEvent.press(screen.getByRole("link"));
  expect(router.push).toHaveBeenCalledWith("/automation");
});

it("order status refresh replaces partial with broker-reported filled state", async () => {
  const view = await render(<Portfolio />);
  await fireEvent.press(screen.getByRole("tab", { name: "Orders" }));
  expect(screen.getByText("PARTIAL")).toBeTruthy();
  mockOrders.orders[0]!.status = "FILLED";
  await view.rerender(<Portfolio />);
  expect(screen.getByText("FILLED")).toBeTruthy();
  expect(screen.queryByText("PARTIAL")).toBeNull();
});
