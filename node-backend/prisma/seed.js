const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const OWNER_ADMIN_EMAIL = "arjunven01@gmail.com";

async function ensureOwnerAdmin() {
  const email = OWNER_ADMIN_EMAIL;
  const ownerPassword =
    String(process.env.OWNER_ADMIN_SEED_PASSWORD || process.env.SEED_USER_PASSWORD || "");
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!existingUser && !ownerPassword) {
    console.warn(
      `Skipping owner admin creation for ${email}: set OWNER_ADMIN_SEED_PASSWORD to seed a new owner account safely.`
    );
    return null;
  }

  const passwordHash = existingUser
    ? existingUser.passwordHash
    : await bcrypt.hash(ownerPassword, 12);
  const now = new Date();

  const owner = await prisma.user.upsert({
    where: { email },
    update: {
      role: "LEVEL_3_OWNER_ADMIN",
      verificationStatus: "VERIFIED",
      verifiedAt: existingUser?.verifiedAt || now,
      rejectedAt: null,
      rejectedReason: null,
      lastRoleChangedAt: now,
      passwordHash,
    },
    create: {
      name: String(process.env.OWNER_ADMIN_SEED_NAME || "Arjun Owner Admin").trim(),
      email,
      passwordHash,
      role: "LEVEL_3_OWNER_ADMIN",
      verificationStatus: "VERIFIED",
      verifiedAt: now,
      lastRoleChangedAt: now,
    },
  });

  await prisma.userPageAccess.upsert({
    where: {
      userId_pageKey: {
        userId: owner.id,
        pageKey: "ADMIN_DASHBOARD",
      },
    },
    update: {
      allowed: true,
      reason: "Seeded owner admin access",
      updatedByUserId: owner.id,
    },
    create: {
      userId: owner.id,
      pageKey: "ADMIN_DASHBOARD",
      allowed: true,
      reason: "Seeded owner admin access",
      updatedByUserId: owner.id,
    },
  });

  return owner;
}

async function main() {
  await ensureOwnerAdmin();

  let user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!user) {
    const email = String(process.env.SEED_USER_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.SEED_USER_PASSWORD || "");

    if (!email || !password) {
      throw new Error(
        "Create a user first or set SEED_USER_EMAIL and SEED_USER_PASSWORD."
      );
    }

    user = await prisma.user.create({
      data: {
        name: String(process.env.SEED_USER_NAME || "Default Trader").trim(),
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: "LEVEL_1_USER",
        verificationStatus: "PENDING_VERIFICATION",
      },
    });
  }

  const symbols = ["AAPL", "MSFT", "NVDA"];

  for (const symbol of symbols) {
    await prisma.watchlist.upsert({
      where: {
        userId_symbol: {
          userId: user.id,
          symbol,
        },
      },
      update: {},
      create: {
        userId: user.id,
        symbol,
        notes: "Starter watchlist seed",
      },
    });
  }
}

if (require.main === module) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = {
  OWNER_ADMIN_EMAIL,
  ensureOwnerAdmin,
  main,
};
