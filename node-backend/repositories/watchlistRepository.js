const prisma = require("../services/prisma");
const { ownedWhere, requireUserId } = require("./ownership");

function list(userId) {
  return prisma.run((db) =>
    db.watchlist.findMany({
      where: ownedWhere(userId),
      orderBy: { symbol: "asc" },
    })
  );
}

function upsert(symbol, notes, userId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.watchlist.upsert({
      where: { userId_symbol: { userId: ownerId, symbol } },
      update: notes === undefined ? {} : { notes },
      create: { userId: ownerId, symbol, notes },
    })
  );
}

function remove(symbol, userId) {
  return prisma.run((db) =>
    db.watchlist.deleteMany({
      where: ownedWhere(userId, { symbol }),
    })
  );
}

module.exports = { list, remove, upsert };
