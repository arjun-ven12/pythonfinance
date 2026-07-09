const { redactSensitive } = require("../../../services/redactionService");

function createBrokerConnectionLogRepository({ prisma }) {
  async function create(userId, { action, success, error = null, latency = null, metadata = null }) {
    return prisma.run((db) =>
      db.brokerConnectionLog.create({
        data: {
          userId,
          action,
          success: Boolean(success),
          error: error ? String(redactSensitive(String(error))).slice(0, 2000) : null,
          latency: latency == null ? null : Number(latency),
          metadata: redactSensitive(metadata),
        },
      })
    );
  }

  async function list(userId, limit = 1000) {
    return prisma.run((db) =>
      db.brokerConnectionLog.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: Math.min(Math.max(Number(limit) || 100, 1), 1000),
      })
    );
  }

  return { create, list };
}

module.exports = createBrokerConnectionLogRepository;
