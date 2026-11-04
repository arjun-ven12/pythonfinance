import {
  assertPaperControl,
  assertStopAcknowledged,
} from "../src/utils/automation";
import {
  safeNotificationPath,
  money,
  number,
  positions,
  isStale,
} from "../src/utils/data";
import {
  createSequenceGuard,
  connectQuotes,
  StreamSocket,
} from "../src/api/realtime";
import { chartPoints } from "../src/components/FinancialChart";
it("accepts only persisted emergency acknowledgement and exact paper environment", () => {
  expect(
    assertStopAcknowledged({ control: { status: "SUSPENDED", generation: 4 } })
      .generation,
  ).toBe(4);
  for (const state of [
    {},
    { control: { status: "ACTIVE", generation: 4 } },
    { control: { status: "SUSPENDED" } },
  ])
    expect(() => assertStopAcknowledged(state)).toThrow();
  expect(() =>
    assertPaperControl({ mode: "LIVE_AUTONOMOUS", accountId: "REAL" }),
  ).toThrow();
  expect(
    assertPaperControl({
      mode: "PAPER_AUTONOMOUS",
      accountId: "INTERNAL_PAPER",
    }).mode,
  ).toBe("PAPER_AUTONOMOUS");
});
it("keeps missing balances distinct from zero and parses actual holdings without synthetic history", () => {
  expect(money(null)).toBe("—");
  expect(number("invalid")).toBeNull();
  expect(positions({ positions: { AAPL: { quantity: 2 } } })[0]?.quantity).toBe(
    2,
  );
  expect(
    chartPoints([{ equity: 123 }, { equity: null }, { equity: 124 }]).map(
      (p) => p.value,
    ),
  ).toEqual([123, 124]);
  expect(isStale("bad")).toBe(true);
});
it("notification routing rejects arbitrary URLs, execution paths and malformed symbols", () => {
  expect(safeNotificationPath({ path: "/automation" })).toBe("/automation");
  expect(safeNotificationPath({ path: "/symbol/AAPL" })).toBe("/symbol/AAPL");
  for (const path of [
    "https://evil.invalid",
    "/api/execution/activate",
    "//evil.invalid",
    "/symbol/AAPL?execute=true",
  ])
    expect(safeNotificationPath({ path })).toBeNull();
});
it("sequence guard detects duplicate and missing order/quote frames across reconnect", () => {
  const g = createSequenceGuard();
  expect(g.accept(1)).toBe("accept");
  expect(g.accept(1)).toBe("duplicate");
  expect(g.accept(3)).toBe("gap");
  g.reset();
  expect(g.accept(1)).toBe("accept");
  expect(g.accept(undefined)).toBe("gap");
});
it("real-time reconnect reconciles before trusting new frames and stops subscriptions on background", async () => {
  jest.useFakeTimers();
  const sockets: StreamSocket[] = [];
  const quotes = jest.fn(),
    reconcile = jest.fn();
  const factory = jest.fn(async () => {
    const s: StreamSocket = {
      send: jest.fn(),
      close: jest.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    sockets.push(s);
    return s;
  });
  const stop = connectQuotes({
    url: "wss://api.example.com/ws/market-data",
    symbols: ["AAPL", "AAPL"],
    socketFactory: factory,
    onQuote: quotes,
    onReconcile: reconcile,
    onUnauthorized: async () => {},
    onState: jest.fn(),
  });
  await Promise.resolve();
  sockets[0]?.onopen?.();
  expect(sockets[0]?.send).toHaveBeenCalledTimes(1);
  sockets[0]?.onmessage?.({
    data: JSON.stringify({
      sequence: 1,
      channel: "quote",
      symbol: "AAPL",
      payload: { quote: { last: 100 } },
    }),
  });
  sockets[0]?.onmessage?.({
    data: JSON.stringify({
      sequence: 3,
      channel: "quote",
      symbol: "AAPL",
      payload: { quote: { last: 999 } },
    }),
  });
  expect(quotes).toHaveBeenCalledTimes(1);
  expect(reconcile.mock.calls.length).toBeGreaterThan(1);
  sockets[0]?.onclose?.({ code: 1006 });
  await jest.advanceTimersByTimeAsync(1000);
  expect(factory).toHaveBeenCalledTimes(2);
  stop();
  await jest.advanceTimersByTimeAsync(60000);
  expect(factory).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
