const assert = require("node:assert/strict");
const test = require("node:test");

const createBrokerService = require("../features/broker/services/broker/broker.service");

test("broker service uses explicit provider override and saved config for test connection", async () => {
  const calls = [];
  const service = createBrokerService({
    getAdapterForUser: async (_userId, providerOverride) => ({
      testConnection: async (_innerUserId, input) => {
        calls.push({ providerOverride, input });
        return { result: { connected: true, provider: providerOverride } };
      },
    }),
    getProviderForUser: async () => "IBKR",
    readResolvedBrokerConfigForUser: async () => ({
      provider: "MOOMOO",
      executionMode: "PAPER_BROKER",
      config: {
        host: "127.0.0.1",
        port: 11111,
        tradeEnv: "SIMULATE",
      },
      savedConfig: {
        host: "127.0.0.1",
        port: 11111,
      },
    }),
    brokerConnectionLogRepository: {
      create: async () => {},
    },
    brokerOrdersRepository: null,
    buildRiskDashboardFromDatabase: async () => ({}),
    liveExecutionGuard: null,
  });

  const response = await service.testConnection(
    "user-1",
    { transport: "websocket" },
    "MOOMOO"
  );

  assert.equal(response.result.connected, true);
  assert.equal(calls[0].providerOverride, "MOOMOO");
  assert.equal(calls[0].input.provider, "MOOMOO");
  assert.equal(calls[0].input.host, "127.0.0.1");
  assert.equal(calls[0].input.port, 11111);
  assert.equal(calls[0].input.transport, "websocket");
});
