require("dotenv").config();

const prisma = require("../services/prisma");
const { getPortfolioForUser } = require("../services/portfolioLedgerService");

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true },
  });
  let initialized = 0;

  for (const user of users) {
    const existingEvents = await prisma.transactionLedger.count({
      where: { userId: user.id },
    });
    if (existingEvents > 0) continue;

    await getPortfolioForUser(user.id);
    initialized += 1;
  }

  process.stdout.write(
    `Paper ledger backfill complete: ${initialized}/${users.length} users initialized.\n`
  );
}

main()
  .catch((error) => {
    console.error(`Paper ledger backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
