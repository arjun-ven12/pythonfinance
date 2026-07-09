const {
  PAGE_KEYS,
  USER_ROLES,
  VERIFICATION_STATUSES,
  buildPageAccessMap,
} = require("../../../middleware/accessControl");
const { createHttpError } = require("../../../services/authService");
const { redactSensitive } = require("../../../services/redactionService");

const ALL_PAGE_KEYS = Object.values(PAGE_KEYS);
const ALL_ROLES = Object.values(USER_ROLES);

function getRoleRank(role) {
  if (role === USER_ROLES.LEVEL_3_OWNER_ADMIN) return 3;
  if (role === USER_ROLES.LEVEL_2_ADMIN) return 2;
  return 1;
}

function mapUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verificationStatus: user.verificationStatus,
    verifiedAt: user.verifiedAt,
    verifiedByUserId: user.verifiedByUserId,
    rejectedAt: user.rejectedAt,
    rejectedReason: user.rejectedReason,
    lastRoleChangedAt: user.lastRoleChangedAt,
    roleChangedByUserId: user.roleChangedByUserId,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    pageAccess: buildPageAccessMap(user),
    pageAccessEntries: (user.pageAccessEntries || []).map((entry) => ({
      id: entry.id,
      pageKey: entry.pageKey,
      allowed: entry.allowed,
      reason: entry.reason,
      updatedAt: entry.updatedAt,
      updatedByUserId: entry.updatedByUserId,
    })),
  };
}

async function countOwnerAdmins(db) {
  return db.user.count({
    where: {
      role: USER_ROLES.LEVEL_3_OWNER_ADMIN,
    },
  });
}

async function createAuditLog(db, actorUserId, targetUserId, action, metadata) {
  await db.adminAuditLog.create({
    data: {
      actorUserId,
      targetUserId,
      action,
      metadata: redactSensitive(metadata || {}) || undefined,
    },
  });
}

async function getUserOrThrow(db, userId) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      pageAccessEntries: true,
    },
  });

  if (!user) {
    throw createHttpError(404, "User not found.");
  }

  return user;
}

function ensureValidRole(role) {
  if (!ALL_ROLES.includes(role)) {
    throw createHttpError(400, "Invalid role.");
  }
}

function ensureValidPageKey(pageKey) {
  if (!ALL_PAGE_KEYS.includes(pageKey)) {
    throw createHttpError(400, `Invalid page key: ${pageKey}`);
  }
}

function normalizeAccessUpdates(input) {
  if (!Array.isArray(input)) {
    throw createHttpError(400, "pageAccess must be an array.");
  }

  return input.map((entry) => {
    ensureValidPageKey(entry?.pageKey);
    return {
      pageKey: entry.pageKey,
      allowed: Boolean(entry.allowed),
      reason: entry?.reason ? String(entry.reason).trim() : null,
    };
  });
}

function createAdminService({ prisma }) {
  async function listUsers() {
    const users = await prisma.run((db) =>
      db.user.findMany({
        include: {
          pageAccessEntries: true,
        },
        orderBy: [{ createdAt: "asc" }, { email: "asc" }],
      })
    );

    return users.map(mapUser);
  }

  async function verifyUser(actorUserId, targetUserId) {
    const now = new Date();
    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: targetUserId },
          data: {
            verificationStatus: VERIFICATION_STATUSES.VERIFIED,
            verifiedAt: now,
            verifiedByUserId: actorUserId,
            rejectedAt: null,
            rejectedReason: null,
          },
          include: {
            pageAccessEntries: true,
          },
        });

        await createAuditLog(tx, actorUserId, targetUserId, "VERIFY_USER", {});
        return mapUser(updated);
      })
    );
  }

  async function rejectUser(actorUserId, targetUserId, rejectedReason) {
    const now = new Date();
    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: targetUserId },
          data: {
            verificationStatus: VERIFICATION_STATUSES.REJECTED,
            verifiedAt: null,
            verifiedByUserId: null,
            rejectedAt: now,
            rejectedReason: rejectedReason ? String(rejectedReason).trim() : null,
          },
          include: {
            pageAccessEntries: true,
          },
        });

        await createAuditLog(tx, actorUserId, targetUserId, "REJECT_USER", {
          rejectedReason: updated.rejectedReason,
        });
        return mapUser(updated);
      })
    );
  }

  async function suspendUser(actorUserId, targetUserId, reason) {
    if (actorUserId === targetUserId) {
      throw createHttpError(400, "You cannot suspend yourself.");
    }

    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: targetUserId },
          data: {
            verificationStatus: VERIFICATION_STATUSES.SUSPENDED,
            rejectedReason: reason ? String(reason).trim() : null,
          },
          include: {
            pageAccessEntries: true,
          },
        });

        await createAuditLog(tx, actorUserId, targetUserId, "SUSPEND_USER", {
          reason: updated.rejectedReason,
        });
        return mapUser(updated);
      })
    );
  }

  async function updateRole(actorUserId, targetUserId, nextRole) {
    ensureValidRole(nextRole);
    const now = new Date();

    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        const targetUser = await getUserOrThrow(tx, targetUserId);
        const ownerCount = await countOwnerAdmins(tx);
        const demotingOwner =
          targetUser.role === USER_ROLES.LEVEL_3_OWNER_ADMIN &&
          nextRole !== USER_ROLES.LEVEL_3_OWNER_ADMIN;

        if (demotingOwner && ownerCount <= 1) {
          throw createHttpError(
            400,
            "The only Level 3 owner admin cannot be demoted."
          );
        }

        const action =
          getRoleRank(nextRole) > getRoleRank(targetUser.role)
            ? "PROMOTE_ROLE"
            : "DEMOTE_ROLE";

        const updated = await tx.user.update({
          where: { id: targetUserId },
          data: {
            role: nextRole,
            lastRoleChangedAt: now,
            roleChangedByUserId: actorUserId,
          },
          include: {
            pageAccessEntries: true,
          },
        });

        await createAuditLog(tx, actorUserId, targetUserId, action, {
          fromRole: targetUser.role,
          toRole: nextRole,
        });
        return mapUser(updated);
      })
    );
  }

  async function getUserPageAccess(targetUserId) {
    const user = await prisma.run((db) => getUserOrThrow(db, targetUserId));
    return {
      userId: user.id,
      role: user.role,
      verificationStatus: user.verificationStatus,
      pageAccess: buildPageAccessMap(user),
      pageAccessEntries: user.pageAccessEntries.map((entry) => ({
        id: entry.id,
        pageKey: entry.pageKey,
        allowed: entry.allowed,
        reason: entry.reason,
        updatedAt: entry.updatedAt,
        updatedByUserId: entry.updatedByUserId,
      })),
    };
  }

  async function updateUserPageAccess(actorUserId, targetUserId, input) {
    const updates = normalizeAccessUpdates(input);
    const ownerCount = await prisma.run((db) => countOwnerAdmins(db));
    const targetUser = await prisma.run((db) => getUserOrThrow(db, targetUserId));

    if (
      actorUserId === targetUserId &&
      ownerCount <= 1 &&
      updates.some(
        (entry) => entry.pageKey === PAGE_KEYS.ADMIN_DASHBOARD && entry.allowed === false
      )
    ) {
      throw createHttpError(
        400,
        "The only Level 3 owner admin cannot revoke its own Admin Dashboard access."
      );
    }

    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        for (const entry of updates) {
          await tx.userPageAccess.upsert({
            where: {
              userId_pageKey: {
                userId: targetUserId,
                pageKey: entry.pageKey,
              },
            },
            update: {
              allowed: entry.allowed,
              reason: entry.reason,
              updatedByUserId: actorUserId,
            },
            create: {
              userId: targetUserId,
              pageKey: entry.pageKey,
              allowed: entry.allowed,
              reason: entry.reason,
              updatedByUserId: actorUserId,
            },
          });

          await createAuditLog(
            tx,
            actorUserId,
            targetUserId,
            entry.allowed ? "GRANT_PAGE_ACCESS" : "REVOKE_PAGE_ACCESS",
            {
              pageKey: entry.pageKey,
              reason: entry.reason,
            }
          );
        }

        const updated = await getUserOrThrow(tx, targetUserId);
        return {
          userId: updated.id,
          role: updated.role,
          verificationStatus: updated.verificationStatus,
          pageAccess: buildPageAccessMap(updated),
          pageAccessEntries: updated.pageAccessEntries.map((entry) => ({
            id: entry.id,
            pageKey: entry.pageKey,
            allowed: entry.allowed,
            reason: entry.reason,
            updatedAt: entry.updatedAt,
            updatedByUserId: entry.updatedByUserId,
          })),
        };
      })
    );
  }

  async function listAuditLogs() {
    return prisma.run((db) =>
      db.adminAuditLog.findMany({
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          targetUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 250,
      })
    );
  }

  async function enableAdminModeForUser(userId) {
    return prisma.run((db) =>
      db.$transaction(async (tx) => {
        const user = await getUserOrThrow(tx, userId);

        if (user.verificationStatus !== VERIFICATION_STATUSES.VERIFIED) {
          throw createHttpError(
            403,
            "Only verified users can enable Admin Mode."
          );
        }

        if (user.role !== USER_ROLES.LEVEL_1_USER) {
          return mapUser(user);
        }

        const now = new Date();
        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            role: USER_ROLES.LEVEL_2_ADMIN,
            lastRoleChangedAt: now,
            roleChangedByUserId: userId,
          },
          include: {
            pageAccessEntries: true,
          },
        });

        await createAuditLog(tx, userId, userId, "PROMOTE_ROLE", {
          fromRole: USER_ROLES.LEVEL_1_USER,
          toRole: USER_ROLES.LEVEL_2_ADMIN,
          reason: "ADMIN_MODE_ENABLED",
        });

        return mapUser(updated);
      })
    );
  }

  return {
    enableAdminModeForUser,
    getUserPageAccess,
    listAuditLogs,
    listUsers,
    rejectUser,
    suspendUser,
    updateRole,
    updateUserPageAccess,
    verifyUser,
  };
}

module.exports = {
  ALL_PAGE_KEYS,
  createAdminService,
  mapUser,
  normalizeAccessUpdates,
};
