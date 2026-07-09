const TEST_RUNTIME_ALLOW_ENV = "ALLOW_TEST_ENV_RUNTIME";

function isAutomatedTestRuntime(proc = process) {
  const execArgs = Array.isArray(proc.execArgv) ? proc.execArgv : [];
  const args = Array.isArray(proc.argv) ? proc.argv : [];
  const env = proc.env || {};
  const combined = [...execArgs, ...args].map((value) => String(value || ""));

  return (
    env.VITEST === "true" ||
    env.NODE_TEST_CONTEXT === "1" ||
    combined.some((value) => value.includes("--test") || value.includes("vitest"))
  );
}

function getRuntimeGuardStatus(proc = process) {
  const env = proc.env || {};
  const testRuntimeAllowed =
    env.NODE_ENV !== "test" ||
    env[TEST_RUNTIME_ALLOW_ENV] === "true" ||
    isAutomatedTestRuntime(proc);

  return {
    testRuntimeGuardEnabled: true,
    testRuntimeAllowed,
    testRuntimeAllowOverride: env[TEST_RUNTIME_ALLOW_ENV] === "true",
    isAutomatedTestRuntime: isAutomatedTestRuntime(proc),
  };
}

function assertSafeRuntime(proc = process) {
  const env = proc.env || {};
  const status = getRuntimeGuardStatus(proc);

  if (env.NODE_ENV === "test" && !status.testRuntimeAllowed) {
    const error = new Error(
      `Refusing to start backend with NODE_ENV=test outside an automated test harness. ` +
        `Set ${TEST_RUNTIME_ALLOW_ENV}=true only for explicit local test-runtime usage.`
    );
    error.code = "TEST_RUNTIME_BLOCKED";
    throw error;
  }

  return status;
}

module.exports = {
  TEST_RUNTIME_ALLOW_ENV,
  assertSafeRuntime,
  getRuntimeGuardStatus,
  isAutomatedTestRuntime,
};
