const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function isClosedConnectionError(error) {
  const message = `${error?.message || ""} ${error?.cause || ""}`;
  return (
    message.includes("kind: Closed") ||
    (message.toLowerCase().includes("connection") &&
      message.toLowerCase().includes("closed"))
  );
}

prisma.run = async function runPrismaOperation(operation) {
  try {
    return await operation(prisma);
  } catch (error) {
    if (!isClosedConnectionError(error)) {
      throw error;
    }

    await prisma.$disconnect().catch(() => {});
    await prisma.$connect();
    return operation(prisma);
  }
};

module.exports = prisma;
