const assert = require("node:assert/strict");
const test = require("node:test");

const ledgerRepository = require("../repositories/transactionLedgerRepository");
const {
  appendPaperExecution,
  buildBrokerMirrorEvents,
  comparePortfolio,
  rebuildCaches,
  reconstructPortfolio,
} = require("../services/portfolioLedgerService");

function createLedgerTransaction() {
  const rows = [];
  return {
    rows,
    transactionLedger: {
      async count({ where }) {
        return rows.filter(
          (row) =>
            row.userId === where.userId &&
            (!where.eventType || row.eventType === where.eventType)
        ).length;
      },
      async create({ data }) {
        const row = {
          id: `ledger-${rows.length + 1}`,
          ...data,
        };
        rows.push(row);
        return row;
      },
      async findFirst({ where }) {
        return [...rows]
          .filter((row) => row.userId === where.userId)
          .sort((a, b) => b.occurredAt - a.occurredAt)[0] || null;
      },
      async findMany({ where }) {
        return [...rows]
          .filter((row) => row.userId === where.userId)
          .sort((a, b) => a.occurredAt - b.occurredAt);
      },
    },
  };
}

test("buying creates append-only order, fill, and fee ledger events", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 2000 },
  ]);
  await appendPaperExecution(transaction, "user-a", {
    trade: {
      symbol: "AAPL",
      side: "BUY",
      quantity: 10,
      fill_price: 100,
      fee: 1,
      order_type: "MARKET",
    },
    executionId: "trade-buy",
    orderId: "order-buy",
    approvalId: "approval-buy",
  });

  assert.deepEqual(
    transaction.rows.map((row) => row.eventType),
    ["CASH_DEPOSIT", "ORDER_CREATED", "ORDER_EXECUTED", "BUY_FILL", "FEE"]
  );
  assert.equal(Number(transaction.rows[3].cashDelta), -1000);
  assert.equal(Number(transaction.rows[3].positionDelta), 10);
  assert.equal(Number(transaction.rows[4].cashDelta), -1);
});

test("selling creates a positive cash fill and negative position delta", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 2000 },
  ]);
  await appendPaperExecution(transaction, "user-a", {
    trade: {
      symbol: "AAPL",
      side: "SELL",
      quantity: 4,
      fill_price: 120,
      fee: 0,
    },
    executionId: "trade-sell",
    orderId: "order-sell",
    approvalId: "approval-sell",
  });

  assert.deepEqual(
    transaction.rows.map((row) => row.eventType),
    ["CASH_DEPOSIT", "ORDER_CREATED", "ORDER_EXECUTED", "SELL_FILL"]
  );
  assert.equal(Number(transaction.rows[3].cashDelta), 480);
  assert.equal(Number(transaction.rows[3].positionDelta), -4);
});

test("cash cannot become negative unless explicitly enabled", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 100 },
  ]);

  await assert.rejects(
    appendPaperExecution(transaction, "user-a", {
      trade: {
        symbol: "AAPL",
        side: "BUY",
        quantity: 2,
        fill_price: 100,
        fee: 0,
      },
      executionId: "trade-overdraft",
      orderId: "order-overdraft",
    }),
    /make cash negative/
  );
  assert.equal(transaction.rows.length, 1);

  await appendPaperExecution(transaction, "user-a", {
    trade: {
      symbol: "AAPL",
      side: "BUY",
      quantity: 2,
      fill_price: 100,
      fee: 0,
    },
    executionId: "trade-margin",
    orderId: "order-margin",
    allowNegativeCash: true,
  });
  assert.equal(reconstructPortfolio(transaction.rows).cash, -100);
});

test("portfolio reconstructed from ledger matches cash, positions, and P/L", () => {
  const events = [
    {
      id: "deposit",
      eventType: "CASH_DEPOSIT",
      cashDelta: 10000,
      positionDelta: 0,
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "buy",
      eventType: "BUY_FILL",
      symbol: "AAPL",
      price: 100,
      cashDelta: -1000,
      positionDelta: 10,
      metadata: { side: "BUY" },
      occurredAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      id: "fee",
      eventType: "FEE",
      fee: 1,
      symbol: "AAPL",
      cashDelta: -1,
      positionDelta: 0,
      occurredAt: new Date("2026-01-02T00:00:01Z"),
    },
    {
      id: "mark",
      eventType: "POSITION_MARK_TO_MARKET",
      symbol: "AAPL",
      price: 110,
      cashDelta: 0,
      positionDelta: 0,
      occurredAt: new Date("2026-01-03T00:00:00Z"),
    },
    {
      id: "sell",
      eventType: "SELL_FILL",
      symbol: "AAPL",
      price: 120,
      cashDelta: 480,
      positionDelta: -4,
      metadata: { side: "SELL" },
      occurredAt: new Date("2026-01-04T00:00:00Z"),
    },
  ];

  const state = reconstructPortfolio(events);
  assert.equal(state.cash, 9479);
  assert.equal(state.positions.AAPL.quantity, 6);
  assert.equal(state.positions.AAPL.avg_price, 100);
  assert.equal(state.realized_pnl, 80);
  assert.equal(state.unrealized_pnl, 120);
  assert.equal(state.fees_paid, 1);
  assert.equal(state.equity, 10199);
  assert.equal(comparePortfolio(state, state).matched, true);
});

test("rebuild repairs a corrupted materialized portfolio snapshot", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 1000 },
    {
      eventType: "BUY_FILL",
      symbol: "AAPL",
      quantity: 2,
      price: 100,
      cashDelta: -200,
      positionDelta: 2,
    },
  ]);
  let savedSnapshot = null;
  transaction.position = {
    async deleteMany() {},
    async createMany() {},
  };
  transaction.portfolioState = {
    async create({ data }) {
      savedSnapshot = data.stateJson;
      return data;
    },
  };
  transaction.portfolioReconciliation = {
    async create({ data }) {
      return data;
    },
  };

  const result = await rebuildCaches(transaction, "user-a", {
    cash: 12,
    positions: {},
    ledger_event_count: 0,
  });

  assert.equal(savedSnapshot.cash, 800);
  assert.equal(savedSnapshot.positions.AAPL.quantity, 2);
  assert.equal(result.reconciliation.status, "REPAIRED");
  assert.equal(result.reconciliation.matched, false);
});

test("ledger repository exposes no update or delete operation", () => {
  assert.equal(ledgerRepository.update, undefined);
  assert.equal(ledgerRepository.delete, undefined);
  assert.equal(ledgerRepository.deleteMany, undefined);
});

test("corrections append an adjustment without modifying old history", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    {
      eventType: "BUY_FILL",
      symbol: "AAPL",
      quantity: 100,
      price: 100,
      cashDelta: -10000,
      positionDelta: 100,
    },
  ]);
  const originalEvent = { ...transaction.rows[0] };

  await ledgerRepository.appendEvents(transaction, "user-a", [
    {
      eventType: "SELL_FILL",
      symbol: "AAPL",
      quantity: 100,
      price: 100,
      positionDelta: -100,
      metadata: { reason: "COMPENSATING_CORRECTION" },
    },
  ]);

  assert.deepEqual(transaction.rows[0], originalEvent);
  assert.equal(transaction.rows.length, 2);
  assert.equal(
    Object.keys(reconstructPortfolio(transaction.rows).positions).length,
    0
  );
});

test("user ledger queries are isolated by userId", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 1000 },
  ]);
  await ledgerRepository.appendEvents(transaction, "user-b", [
    { eventType: "CASH_DEPOSIT", cashDelta: 2000 },
  ]);

  const userA = await ledgerRepository.listEvents(transaction, "user-a");
  const userB = await ledgerRepository.listEvents(transaction, "user-b");
  assert.equal(userA.length, 1);
  assert.equal(userB.length, 1);
  assert.equal(Number(userA[0].cashDelta), 1000);
  assert.equal(Number(userB[0].cashDelta), 2000);
});

test("corrupted hash chain is detected", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 1000 },
    {
      eventType: "BUY_FILL",
      symbol: "AAPL",
      quantity: 1,
      price: 100,
      cashDelta: -100,
      positionDelta: 1,
    },
  ]);
  transaction.rows[0].cashDelta = "999.00000000";

  const integrity = await ledgerRepository.verifyHashChain(
    transaction,
    "user-a"
  );
  assert.equal(integrity.valid, false);
  assert.equal(integrity.corruptedEventId, "ledger-1");
});

test("broker mirror plan aligns ledger balances to broker state without rewriting history", async () => {
  const transaction = createLedgerTransaction();
  await ledgerRepository.appendEvents(transaction, "user-a", [
    { eventType: "CASH_DEPOSIT", cashDelta: 100000 },
    {
      eventType: "BUY_FILL",
      symbol: "AAPL",
      quantity: 1,
      price: 298.01,
      cashDelta: -298.01,
      positionDelta: 1,
    },
  ]);

  const currentState = reconstructPortfolio(transaction.rows);
  const plan = buildBrokerMirrorEvents(currentState, {
    available: true,
    cash: 995990.65,
    equity: 996769.97,
    positions: [
      { symbol: "AAPL", quantity: 2, averageCost: 298.01, lastPrice: 300.12 },
      { symbol: "NVDA", quantity: 2, averageCost: 193.05, lastPrice: 194.83 },
    ],
  });

  assert.ok(plan.events.length > 0);
  await ledgerRepository.appendEvents(transaction, "user-a", plan.events);

  const syncedState = reconstructPortfolio(transaction.rows);
  assert.equal(syncedState.cash, 995990.65);
  assert.equal(syncedState.positions.AAPL.quantity, 2);
  assert.equal(syncedState.positions.AAPL.avg_price, 298.01);
  assert.equal(syncedState.positions.NVDA.quantity, 2);
  assert.equal(syncedState.positions.NVDA.avg_price, 193.05);
});
