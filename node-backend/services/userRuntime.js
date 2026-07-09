const fs = require("node:fs");
const path = require("node:path");

const pythonEngineDir = path.join(__dirname, "..", "..", "python-engine");
const runtimeUsersDir = path.join(pythonEngineDir, "runtime", "users");
const safeUserIdPattern = /^[A-Za-z0-9._-]+$/;

const filenames = Object.freeze({
  portfolio: "portfolio_state.json",
  paperTrades: "paper_trades.json",
  scanResults: "scan_results.json",
  settings: "settings.json",
  safety: "safety.json",
  strategy: "strategy.json",
  alerts: "alerts.json",
  proposedOrders: "proposed_orders.json",
  engineStatus: "engine_status.json",
});

function requireRuntimeUserId(userId) {
  const value = String(userId || "").trim();

  if (!value || !safeUserIdPattern.test(value)) {
    throw new Error("A valid user ID is required for Python runtime state.");
  }

  return value;
}

function getUserRuntimeDir(userId, { create = true } = {}) {
  const directory = path.join(runtimeUsersDir, requireRuntimeUserId(userId));

  if (create) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return directory;
}

function getUserRuntimePath(userId, stateName) {
  const filename = filenames[stateName];

  if (!filename) {
    throw new Error(`Unknown runtime state name: ${stateName}`);
  }

  return path.join(getUserRuntimeDir(userId), filename);
}

function writeUserRuntimeJson(userId, stateName, value) {
  const target = getUserRuntimePath(userId, stateName);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, target);
  return value;
}

module.exports = {
  filenames,
  getUserRuntimeDir,
  getUserRuntimePath,
  requireRuntimeUserId,
  writeUserRuntimeJson,
};
