const assert = require("node:assert/strict");
const test = require("node:test");

const createMoomooAdapter = require("../features/broker/adapters/moomoo/moomooAdapter");

test("moomoo adapter defaults to the python bridge transport", async () => {
  const adapter = createMoomooAdapter({
    bridgeRunner: async () => ({
      ok: true,
      connected: true,
      opendReachable: true,
      protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
      gatewayRunning: true,
      loggedIn: true,
      marketDataAvailable: true,
      accountLoaded: false,
      accountsFound: 0,
      accountListResult: "EMPTY",
      paperMode: true,
      orderPermission: false,
      fundsLoaded: false,
    }),
  });

  const { config, result } = await adapter.testConnection("user-1", {});
  assert.equal(config.transport, "python_bridge");
  assert.equal(result.protocolUsed, "PYTHON_BRIDGE_TCP_SDK");
});
