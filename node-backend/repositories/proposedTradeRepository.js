const prisma = require("../services/prisma");
const { ownedWhere, requireUserId } = require("./ownership");

function list(userId) {
  return prisma.run((db) => db.proposedTrade.findMany({
    where: ownedWhere(userId),
    orderBy: { createdAt: "desc" },
  }));
}

function findById(id, userId) {
  return prisma.run((db) => db.proposedTrade.findFirst({
    where: ownedWhere(userId, { id }),
  }));
}

function findActiveBySymbol(symbol, userId) {
  return prisma.run((db) => db.proposedTrade.findFirst({
    where: ownedWhere(userId, {
      symbol,
      status: {
        in: ["PROPOSED", "PENDING_APPROVAL", "PENDING", "APPROVED"],
      },
    }),
    orderBy: { createdAt: "desc" },
  }));
}

function create(data, userId) {
  return prisma.run((db) => db.proposedTrade.create({
    data: {
      ...data,
      userId: requireUserId(userId),
    },
  }));
}

function update(id, data, userId) {
  return prisma.run(async (db) => {
    const result = await db.proposedTrade.updateMany({
      where: ownedWhere(userId, { id }),
      data,
    });

    if (result.count !== 1) {
      throw new Error("Proposed trade not found.");
    }

    return db.proposedTrade.findFirst({
      where: ownedWhere(userId, { id }),
    });
  });
}

module.exports = {
  create,
  findActiveBySymbol,
  findById,
  list,
  update,
};
