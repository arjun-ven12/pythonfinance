const assert = require("node:assert/strict");
const test = require("node:test");

const createBrokerConfigService = require("../features/broker/services/brokerConfig.service");

function createPrismaDouble() {
  const records = new Map();

  return {
    prisma: {
      run: async (operation) =>
        operation({
          brokerConfig: {
            findUnique: async ({ where }) => records.get(where.userId) || null,
            upsert: async ({ where, update, create }) => {
              const existing = records.get(where.userId);
              const next = existing
                ? { ...existing, ...update }
                : { id: "cfg-1", ...create };
              records.set(where.userId, next);
              return next;
            },
          },
        }),
    },
    records,
  };
}

test("default moomoo config uses port 11111", async () => {
  const previousPort = process.env.MOOMOO_OPEND_PORT;
  delete process.env.MOOMOO_OPEND_PORT;

  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  try {
    const config = await service.readResolvedBrokerConfig("user-1", "MOOMOO");
    assert.equal(config.config.port, 11111);
  } finally {
    process.env.MOOMOO_OPEND_PORT = previousPort;
  }
});

test("unsaved broker config defaults to Internal Paper", async () => {
  const previousProvider = process.env.DEFAULT_BROKER_PROVIDER;
  delete process.env.DEFAULT_BROKER_PROVIDER;

  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  try {
    const config = await service.readResolvedBrokerConfig("user-1");
    assert.equal(config.provider, "INTERNAL_PAPER");
    assert.equal(config.executionMode, "INTERNAL_PAPER");
    assert.deepEqual(config.config, {});
  } finally {
    process.env.DEFAULT_BROKER_PROVIDER = previousProvider;
  }
});

test("saved prisma broker config overrides env defaults", async () => {
  const previousPort = process.env.MOOMOO_OPEND_PORT;
  process.env.MOOMOO_OPEND_PORT = "33333";

  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  try {
    await service.writeBrokerConfig("user-1", {
      provider: "MOOMOO",
      config: {
        port: 11111,
        host: "127.0.0.1",
        transport: "websocket",
        tradeEnv: "SIMULATE",
      },
    });

    const config = await service.readResolvedBrokerConfig("user-1", "MOOMOO");
    assert.equal(config.config.port, 11111);
    assert.equal(config.savedConfig.port, 11111);
  } finally {
    process.env.MOOMOO_OPEND_PORT = previousPort;
  }
});

test("config endpoint shape strips secret-like fields from saved config", async () => {
  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  await service.writeBrokerConfig("user-1", {
    provider: "MOOMOO",
    config: {
      host: "127.0.0.1",
      port: 11111,
      websocketKey: "do-not-store",
      tradingPasswordMd5: "do-not-store",
      transport: "websocket",
    },
  });

  const config = await service.readResolvedBrokerConfig("user-1", "MOOMOO");
  assert.equal(config.config.websocketKey, undefined);
  assert.equal(config.config.tradingPasswordMd5, undefined);
});

test("moomoo config splits composite account selections into account id and trade env", async () => {
  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  await service.writeBrokerConfig("user-1", {
    provider: "MOOMOO",
    config: {
      accountId: "REAL:1832345",
      tradeEnv: "SIMULATE",
    },
  });

  const config = await service.readResolvedBrokerConfig("user-1", "MOOMOO");

  assert.equal(config.config.accountId, "1832345");
  assert.equal(config.config.tradeEnv, "REAL");
});

test("users cannot read or update another user's broker config", async () => {
  const { prisma } = createPrismaDouble();
  const service = createBrokerConfigService({ prisma });

  await service.writeBrokerConfig("user-a", {
    provider: "MOOMOO",
    config: { port: 11111, host: "127.0.0.1" },
  });

  await service.writeBrokerConfig("user-b", {
    provider: "MOOMOO",
    config: { port: 22222, host: "10.0.0.1" },
  });

  const configA = await service.readResolvedBrokerConfig("user-a", "MOOMOO");
  const configB = await service.readResolvedBrokerConfig("user-b", "MOOMOO");

  assert.equal(configA.config.port, 11111);
  assert.equal(configB.config.port, 22222);
});
