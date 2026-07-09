const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TEST_RUNTIME_ALLOW_ENV,
  assertSafeRuntime,
  getRuntimeGuardStatus,
} = require("../config/runtimeGuard");

function createProcessDouble({
  env = {},
  argv = ["node", "server.js"],
  execArgv = [],
} = {}) {
  return {
    env,
    argv,
    execArgv,
  };
}

test("test env without override blocks normal server startup", () => {
  const proc = createProcessDouble({
    env: { NODE_ENV: "test" },
  });

  assert.throws(
    () => assertSafeRuntime(proc),
    /Refusing to start backend with NODE_ENV=test/
  );
});

test("test env with ALLOW_TEST_ENV_RUNTIME allows explicit runtime", () => {
  const proc = createProcessDouble({
    env: { NODE_ENV: "test", [TEST_RUNTIME_ALLOW_ENV]: "true" },
  });

  const status = assertSafeRuntime(proc);
  assert.equal(status.testRuntimeAllowed, true);
  assert.equal(status.testRuntimeAllowOverride, true);
});

test("automated node test runtime is allowed without override", () => {
  const proc = createProcessDouble({
    env: { NODE_ENV: "test" },
    execArgv: ["--test"],
  });

  const status = assertSafeRuntime(proc);
  assert.equal(status.testRuntimeAllowed, true);
  assert.equal(status.isAutomatedTestRuntime, true);
});

test("development and production runtimes are unaffected", () => {
  assert.equal(
    getRuntimeGuardStatus(
      createProcessDouble({ env: { NODE_ENV: "development" } })
    ).testRuntimeAllowed,
    true
  );
  assert.equal(
    getRuntimeGuardStatus(
      createProcessDouble({ env: { NODE_ENV: "production" } })
    ).testRuntimeAllowed,
    true
  );
});
