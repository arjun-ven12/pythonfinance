const fs = require("node:fs");
const path = require("node:path");

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(entryPath);
    }
    return [entryPath];
  });
}

function createRuntimeDiagnosticsService({
  getUserRuntimeDir,
  prisma,
}) {
  async function getRuntimeDiagnostics(userId) {
    const runtimeDir = getUserRuntimeDir(userId, { create: false });
    const files = walkFiles(runtimeDir);
    const stats = files.map((file) => fs.statSync(file));
    const cacheSize = stats.reduce((total, stat) => total + stat.size, 0);
    const oldestTimestamp = stats.reduce(
      (oldest, stat) => Math.min(oldest, stat.mtimeMs),
      Number.POSITIVE_INFINITY
    );
    const recoverableJobs = await prisma.run((db) =>
      db.scanJob.findMany({
        where: {
          userId,
          status: { in: ["QUEUED", "RUNNING"] },
        },
        select: {
          id: true,
          status: true,
          type: true,
          startedAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      })
    );

    return {
      enabled: String(process.env.DEBUG_WRITE_RUNTIME_JSON || "")
        .trim()
        .toLowerCase() === "true",
      runtimeDir,
      fileCount: files.length,
      cacheSize,
      oldestFile:
        Number.isFinite(oldestTimestamp) && files.length
          ? new Date(oldestTimestamp).toISOString()
          : null,
      recoverableJobs,
    };
  }

  return {
    getRuntimeDiagnostics,
  };
}

module.exports = createRuntimeDiagnosticsService;
