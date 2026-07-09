const prisma = require("./prisma");

async function getSystemDataHealth() {
  try {
    await prisma.run((db) => db.$queryRaw`SELECT 1`);
    return {
      prisma: "connected",
      jsonFallbackActive: false,
      degradedMode: false,
      stale: false,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      prisma: "disconnected",
      jsonFallbackActive: false,
      degradedMode: true,
      stale: true,
      warning:
        "Database unavailable. Mutable trading data is not being served from JSON.",
      error: error.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

module.exports = { getSystemDataHealth };
