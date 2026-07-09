const assert = require("node:assert/strict");
const test = require("node:test");

const requestLogger = require("../middleware/requestLogger");
const createBrokerConnectionLogRepository = require("../features/broker/repositories/brokerConnectionLog.repository");
const { redactSensitive } = require("../services/redactionService");

test("redactSensitive removes secret-bearing keys", () => {
  const redacted = redactSensitive({
    authorization: "Bearer abc",
    nested: {
      apiKey: "secret",
      chatId: "12345",
    },
    safe: "value",
  });

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.nested.apiKey, "[REDACTED]");
  assert.equal(redacted.nested.chatId, "[REDACTED]");
  assert.equal(redacted.safe, "value");
});

test("request logger redacts authorization and cookie headers", async () => {
  const entries = [];
  const originalInfo = console.info;
  console.info = (value) => entries.push(JSON.parse(value));

  const req = {
    headers: {
      authorization: "Bearer super-secret",
      cookie: "trading_access=secret-cookie",
      "x-csrf-token": "csrf-secret",
    },
    method: "GET",
    originalUrl: "/api/orders",
    user: { id: "user-1" },
  };
  const res = {
    statusCode: 200,
    setHeader() {},
    on(event, handler) {
      if (event === "finish") {
        handler();
      }
    },
  };

  try {
    requestLogger(req, res, () => {});
  } finally {
    console.info = originalInfo;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0].headers.authorization, "[REDACTED]");
  assert.equal(entries[0].headers.cookie, "[REDACTED]");
  assert.equal(entries[0].headers["x-csrf-token"], "[REDACTED]");
});

test("broker connection logs redact secret config metadata", async () => {
  let written = null;
  const repository = createBrokerConnectionLogRepository({
    prisma: {
      run: async (operation) =>
        operation({
          brokerConnectionLog: {
            create: async ({ data }) => {
              written = data;
              return data;
            },
          },
        }),
    },
  });

  await repository.create("user-1", {
    action: "TEST_CONNECTION",
    success: false,
    error: "authorization=Bearer secret-token",
    metadata: {
      provider: "MOOMOO",
      websocketKey: "abc",
      nested: { brokerPassword: "pass" },
    },
  });

  assert.equal(written.error, "authorization=[REDACTED]");
  assert.equal(written.metadata.websocketKey, "[REDACTED]");
  assert.equal(written.metadata.nested.brokerPassword, "[REDACTED]");
});
