const prisma = require("../services/prisma");
const { requireUserId } = require("./ownership");

function read(userId, key) {
  return prisma.run((db) =>
    db.settings.findFirst({
      where: { userId: requireUserId(userId), key },
    })
  );
}

function write(userId, key, value) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.settings.upsert({
      where: { userId_key: { userId: ownerId, key } },
      update: { value },
      create: { userId: ownerId, key, value },
    })
  );
}

module.exports = { read, write };
