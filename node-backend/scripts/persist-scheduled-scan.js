require("dotenv").config({
  path: require("node:path").join(__dirname, "..", ".env"),
});

const path = require("node:path");
const { persistCompletedScan } = require("../services/scanPersistenceService");
const {
  getUserRuntimeDir,
} = require("../services/userRuntime");
const {
  normalizeArtifactPayload,
} = require("../services/artifacts/artifactValidator");

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const userId = getArgument("--user-id");

  if (!userId) {
    throw new Error("A scheduler owner user ID is required.");
  }

  const suppliedRuntimeDir = getArgument("--runtime-dir");
  const expectedRuntimeDir = getUserRuntimeDir(userId, { create: false });

  if (
    suppliedRuntimeDir &&
    path.resolve(suppliedRuntimeDir) !== path.resolve(expectedRuntimeDir)
  ) {
    throw new Error("Scheduler runtime directory does not match its owner.");
  }

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const artifacts = normalizeArtifactPayload(JSON.parse(input || "{}"));
  const scanResults = artifacts.scan_results;

  if (!scanResults?.generated_at) {
    throw new Error("Scheduler did not provide valid scan artifacts.");
  }

  const result = await persistCompletedScan({
    scanResults,
    userId,
    durationSeconds: getArgument("--duration"),
    source: "scheduler",
    startedAt: getArgument("--started-at"),
    alerts: artifacts.alerts || [],
    proposedOrders: artifacts.proposed_orders || { orders: [] },
  });
  process.stdout.write(JSON.stringify(result));
}

main()
  .catch((error) => {
    process.stderr.write(`Scheduled scan persistence failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const prisma = require("../services/prisma");
    await prisma.$disconnect().catch(() => {});
  });
