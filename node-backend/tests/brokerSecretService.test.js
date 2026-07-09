const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBrokerSecretService,
} = require("../features/broker/services/brokerSecret.service");

const CURRENT_KEY =
  "current:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function createPrismaDouble() {
  const records = new Map();

  return {
    prisma: {
      run: async (operation) =>
        operation({
          brokerSecret: {
            upsert: async ({ where, update, create }) => {
              const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
              const existing = records.get(key);
              const next = existing
                ? { ...existing, ...update, updatedAt: new Date("2026-07-02T14:00:00Z") }
                : {
                    id: create.id || "secret-1",
                    ...create,
                    createdAt: new Date("2026-07-02T13:00:00Z"),
                    updatedAt: new Date("2026-07-02T13:00:00Z"),
                  };
              records.set(key, next);
              return next;
            },
            findUnique: async ({ where }) =>
              records.get(
                `${where.userId_provider.userId}:${where.userId_provider.provider}`
              ) || null,
            deleteMany: async ({ where }) => {
              records.delete(`${where.userId}:${where.provider}`);
              return { count: 1 };
            },
          },
        }),
    },
    records,
  };
}

test("broker secrets are encrypted at rest and not returned plaintext from status", async () => {
  const previousKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;

  const { prisma, records } = createPrismaDouble();
  const service = createBrokerSecretService({ prisma });

  try {
    const status = await service.upsertBrokerSecret("user-1", "MOOMOO", {
      tradingPasswordMd5: "md5-secret",
    });
    const stored = [...records.values()][0];

    assert.equal(status.configured, true);
    assert.ok(stored.encryptedPayload.startsWith("v1:current:"));
    assert.doesNotMatch(stored.encryptedPayload, /md5-secret/);
    assert.deepEqual(await service.getBrokerSecret("user-1", "MOOMOO"), {
      tradingPasswordMd5: "md5-secret",
    });
  } finally {
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousKey;
  }
});

test("users cannot access another user's broker secret", async () => {
  const previousKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;

  const { prisma } = createPrismaDouble();
  const service = createBrokerSecretService({ prisma });

  try {
    await service.upsertBrokerSecret("user-a", "IBKR", {
      apiKey: "secret-a",
    });

    assert.equal(await service.getBrokerSecret("user-b", "IBKR"), null);
  } finally {
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousKey;
  }
});

test("broker secrets cannot be stored plaintext when encryption key is missing", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.NODE_ENV = "development";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;

  const { prisma } = createPrismaDouble();
  const service = createBrokerSecretService({ prisma });

  try {
    await assert.rejects(
      () =>
        service.upsertBrokerSecret("user-1", "MOOMOO", {
          tradingPasswordMd5: "md5-secret",
        }),
      /APP_ENCRYPTION_KEY_CURRENT/
    );
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousKey;
  }
});

test("missing BrokerSecret table degrades status reads and blocks secret writes cleanly", async () => {
  const previousKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;

  const prisma = {
    run: async () => {
      const error = new Error(
        "The table `public.BrokerSecret` does not exist in the current database."
      );
      error.code = "P2021";
      throw error;
    },
  };

  const service = createBrokerSecretService({ prisma });

  try {
    const status = await service.getBrokerSecretStatus("user-1", "MOOMOO");
    assert.deepEqual(status, {
      configured: false,
      provider: "MOOMOO",
      lastUpdatedAt: null,
      keyVersion: null,
      storageReady: false,
    });

    assert.equal(await service.getBrokerSecret("user-1", "MOOMOO"), null);

    await assert.rejects(
      () =>
        service.upsertBrokerSecret("user-1", "MOOMOO", {
          tradingPasswordMd5: "md5-secret",
        }),
      /Broker secret storage is not available/
    );

    const deleted = await service.deleteBrokerSecret("user-1", "MOOMOO");
    assert.equal(deleted.configured, false);
  } finally {
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousKey;
  }
});
