const { requireUserId } = require("./ownership");

const ACTIVE_STATUSES = ["QUEUED", "RUNNING"];

async function lockUserJobType(transaction, userId, type) {
  if (typeof transaction.$executeRaw === "function") {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`scan-job:${userId}:${type}`}))
    `;
  }
}

async function createJob(prisma, {
  userId,
  type,
  timeoutAt,
  symbolsTotal = 0,
  metadata = {},
}) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      await lockUserJobType(transaction, ownerId, type);
      const activeJob = await transaction.scanJob.findFirst({
        where: {
          userId: ownerId,
          type,
          status: { in: ACTIVE_STATUSES },
        },
        orderBy: { createdAt: "desc" },
      });

      if (activeJob) {
        const error = new Error(`An active ${type.toLowerCase()} scan already exists.`);
        error.statusCode = 409;
        error.job = activeJob;
        throw error;
      }

      return transaction.scanJob.create({
        data: {
          userId: ownerId,
          type,
          timeoutAt,
          symbolsTotal,
          currentStage: "QUEUED",
          metadata,
        },
      });
    })
  );
}

function findOwnedJob(prisma, userId, jobId) {
  return prisma.run((db) =>
    db.scanJob.findFirst({
      where: {
        id: jobId,
        userId: requireUserId(userId),
      },
    })
  );
}

function findActiveJob(prisma, userId, type = null) {
  return prisma.run((db) =>
    db.scanJob.findFirst({
      where: {
        userId: requireUserId(userId),
        ...(type ? { type } : {}),
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: "desc" },
    })
  );
}

function updateOwnedJob(prisma, userId, jobId, data) {
  const ownerId = requireUserId(userId);
  return prisma.run(async (db) => {
    const updated = await db.scanJob.updateMany({
      where: { id: jobId, userId: ownerId },
      data,
    });

    if (updated.count !== 1) {
      return null;
    }

    return db.scanJob.findFirst({
      where: { id: jobId, userId: ownerId },
    });
  });
}

function markInterruptedJobs(prisma) {
  return prisma.run((db) =>
    db.scanJob.updateMany({
      where: { status: { in: ACTIVE_STATUSES } },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        currentStage: "SERVER_RESTARTED",
        pid: null,
        metadata: {
          error: "Backend restarted while the scan was active.",
        },
      },
    })
  );
}

module.exports = {
  ACTIVE_STATUSES,
  createJob,
  findActiveJob,
  findOwnedJob,
  markInterruptedJobs,
  updateOwnedJob,
};
