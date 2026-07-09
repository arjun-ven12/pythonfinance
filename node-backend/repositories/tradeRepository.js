const prisma = require("../services/prisma");
const { ownedWhere, requireUserId } = require("./ownership");

function list(userId, where = {}) {
  return prisma.run((db) =>
    db.trade.findMany({
      where: ownedWhere(userId, where),
      orderBy: { createdAt: "desc" },
    })
  );
}

function create(data, userId) {
  return prisma.run((db) =>
    db.trade.create({
      data: { ...data, userId: requireUserId(userId) },
    })
  );
}

function update(id, data, userId) {
  return prisma.run((db) =>
    db.trade.updateMany({
      where: ownedWhere(userId, { id }),
      data,
    })
  );
}

module.exports = { create, list, update };
