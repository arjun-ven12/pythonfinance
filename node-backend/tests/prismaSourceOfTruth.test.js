const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const prisma = require("../services/prisma");
const { getSystemDataHealth } = require("../services/systemDataHealth");

test("scan persistence never reads runtime JSON as database input", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "services", "scanPersistenceService.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /readUserRuntimeJson|readFileSync/);
  assert.match(source, /alerts = \[\]/);
  assert.match(source, /proposedOrders = \{ orders: \[\] \}/);
});

test("scheduled scan persistence consumes process input, not cache files", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "persist-scheduled-scan.js"),
    "utf8"
  );

  assert.match(source, /process\.stdin/);
  assert.doesNotMatch(source, /readFileSync/);
});

test("paper execution receives portfolio and trade state from Prisma context", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "features",
      "paperExecution",
      "services",
      "paperExecution.service.js"
    ),
    "utf8"
  );

  assert.match(source, /getPortfolioForUser\(ownerId\)/);
  assert.match(source, /db\.paperTrade\.findMany/);
  assert.doesNotMatch(source, /readUserRuntimeJson|readFileSync/);
});

test("validation reads historical signals from Prisma without mock substitution", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "services", "validationService.js"),
    "utf8"
  );

  assert.match(source, /db\.validationSignal\.findMany/);
  assert.doesNotMatch(source, /buildMockSignals|mock-\$\{/);
});

test("safety evaluation consumes explicit context instead of runtime state files", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "python-engine", "safety_manager.py"),
    "utf8"
  );

  assert.match(source, /def evaluate_safety\(proposed_orders_data, portfolio_state, safety_status\)/);
  assert.doesNotMatch(source, /get_runtime_path|portfolio_state_file|proposed_orders_file/);
});

test("system data health reports Prisma as authoritative", async () => {
  const originalRun = prisma.run;
  prisma.run = async () => [{ "?column?": 1 }];

  try {
    const health = await getSystemDataHealth();
    assert.equal(health.prisma, "connected");
    assert.equal(health.jsonFallbackActive, false);
    assert.equal(health.degradedMode, false);
    assert.equal(health.stale, false);
  } finally {
    prisma.run = originalRun;
  }
});

test("system data health fails visibly without enabling JSON mutation", async () => {
  const originalRun = prisma.run;
  prisma.run = async () => {
    throw new Error("database unavailable");
  };

  try {
    const health = await getSystemDataHealth();
    assert.equal(health.prisma, "disconnected");
    assert.equal(health.jsonFallbackActive, false);
    assert.equal(health.degradedMode, true);
    assert.equal(health.stale, true);
  } finally {
    prisma.run = originalRun;
  }
});
