const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const prisma = require("../services/prisma");
const alertRepository = require("../repositories/alertRepository");
const proposedTradeRepository = require("../repositories/proposedTradeRepository");
const settingsRepository = require("../repositories/settingsRepository");
const tradeRepository = require("../repositories/tradeRepository");
const watchlistRepository = require("../repositories/watchlistRepository");

async function withFakePrisma(database, callback) {
  const originalRun = prisma.run;
  prisma.run = async (operation) => operation(database);

  try {
    return await callback();
  } finally {
    prisma.run = originalRun;
  }
}

test("user A cannot read user B watchlist or alerts", async () => {
  const watchlists = [
    { id: "wa", userId: "user-a", symbol: "AAPL" },
    { id: "wb", userId: "user-b", symbol: "MSFT" },
  ];
  const alerts = [
    { id: "aa", userId: "user-a", symbol: "AAPL" },
    { id: "ab", userId: "user-b", symbol: "MSFT" },
  ];

  await withFakePrisma(
    {
      watchlist: {
        findMany: async ({ where }) =>
          watchlists.filter((item) => item.userId === where.userId),
      },
      alert: {
        findMany: async ({ where }) =>
          alerts.filter((item) => item.userId === where.userId),
      },
    },
    async () => {
      assert.deepEqual(
        (await watchlistRepository.list("user-a")).map((item) => item.symbol),
        ["AAPL"]
      );
      assert.deepEqual(
        (await alertRepository.list("user-a")).map((item) => item.symbol),
        ["AAPL"]
      );
    }
  );
});

test("user A cannot update user B trade", async () => {
  const trades = [{ id: "trade-b", userId: "user-b", notes: "private" }];

  await withFakePrisma(
    {
      trade: {
        updateMany: async ({ where, data }) => {
          const trade = trades.find(
            (item) => item.id === where.id && item.userId === where.userId
          );
          if (!trade) return { count: 0 };
          Object.assign(trade, data);
          return { count: 1 };
        },
      },
    },
    async () => {
      const result = await tradeRepository.update(
        "trade-b",
        { notes: "stolen" },
        "user-a"
      );
      assert.equal(result.count, 0);
      assert.equal(trades[0].notes, "private");
    }
  );
});

test("user A cannot access user B proposed trade for execution", async () => {
  await withFakePrisma(
    {
      proposedTrade: {
        findFirst: async ({ where }) =>
          where.id === "proposal-b" && where.userId === "user-b"
            ? { id: "proposal-b", userId: "user-b" }
            : null,
      },
    },
    async () => {
      assert.equal(
        await proposedTradeRepository.findById("proposal-b", "user-a"),
        null
      );
    }
  );
});

test("same watchlist symbol is independently keyed per user", async () => {
  const keys = [];

  await withFakePrisma(
    {
      watchlist: {
        upsert: async ({ where, create }) => {
          keys.push(where.userId_symbol);
          return create;
        },
      },
    },
    async () => {
      await watchlistRepository.upsert("AAPL", null, "user-a");
      await watchlistRepository.upsert("AAPL", null, "user-b");
    }
  );

  assert.deepEqual(keys, [
    { userId: "user-a", symbol: "AAPL" },
    { userId: "user-b", symbol: "AAPL" },
  ]);
});

test("settings are user-specific", async () => {
  const settings = [
    { userId: "user-a", key: "risk", value: { max: 1 } },
    { userId: "user-b", key: "risk", value: { max: 3 } },
  ];

  await withFakePrisma(
    {
      settings: {
        findFirst: async ({ where }) =>
          settings.find(
            (item) => item.userId === where.userId && item.key === where.key
          ),
      },
    },
    async () => {
      assert.deepEqual(
        (await settingsRepository.read("user-a", "risk")).value,
        { max: 1 }
      );
      assert.deepEqual(
        (await settingsRepository.read("user-b", "risk")).value,
        { max: 3 }
      );
    }
  );
});

test("strategy and universe names are unique only within a user", () => {
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "prisma", "schema.prisma"),
    "utf8"
  );

  assert.match(schema, /model StrategyExperiment[\s\S]*@@unique\(\[userId, name\]\)/);
  assert.match(schema, /model StockUniverse[\s\S]*@@unique\(\[userId, name\]\)/);
});
