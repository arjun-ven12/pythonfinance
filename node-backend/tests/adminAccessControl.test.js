const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PAGE_KEYS,
  USER_ROLES,
  VERIFICATION_STATUSES,
  buildPageAccessMap,
  requirePageAccess,
  requireRole,
  requireVerifiedUser,
} = require("../middleware/accessControl");
const { DEFAULT_NEW_USER_STATE } = require("../services/authService");
const { createAdminService } = require("../features/admin/services/admin.service");
const { OWNER_ADMIN_EMAIL } = require("../prisma/seed");

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createFakeAdminPrisma(seedUsers = [], seedPageAccess = []) {
  const state = {
    users: seedUsers.map((user) => ({ ...user })),
    pageAccess: seedPageAccess.map((entry) => ({ ...entry })),
    auditLogs: [],
  };

  function findUser(userId) {
    return state.users.find((user) => user.id === userId) || null;
  }

  function userWithAccess(user) {
    if (!user) return null;
    return {
      ...user,
      pageAccessEntries: state.pageAccess.filter((entry) => entry.userId === user.id),
    };
  }

  const db = {
    user: {
      async findMany() {
        return state.users.map(userWithAccess);
      },
      async findUnique({ where }) {
        if (where.id) return userWithAccess(findUser(where.id));
        if (where.email) return userWithAccess(state.users.find((user) => user.email === where.email) || null);
        return null;
      },
      async update({ where, data }) {
        const user = findUser(where.id);
        Object.assign(user, data);
        return userWithAccess(user);
      },
      async count({ where }) {
        return state.users.filter((user) => (!where?.role || user.role === where.role)).length;
      },
    },
    userPageAccess: {
      async upsert({ where, create, update }) {
        const existing = state.pageAccess.find(
          (entry) =>
            entry.userId === where.userId_pageKey.userId &&
            entry.pageKey === where.userId_pageKey.pageKey
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }

        const created = {
          id: `upa-${state.pageAccess.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        state.pageAccess.push(created);
        return created;
      },
    },
    adminAuditLog: {
      async create({ data }) {
        const log = {
          id: `log-${state.auditLogs.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        state.auditLogs.push(log);
        return log;
      },
      async findMany() {
        return state.auditLogs;
      },
    },
    async $transaction(callback) {
      return callback(db);
    },
  };

  return {
    prisma: {
      run: async (operation) => operation(db),
    },
    state,
  };
}

test("new users default to Level 1 pending verification", () => {
  assert.deepEqual(DEFAULT_NEW_USER_STATE, {
    role: USER_ROLES.LEVEL_1_USER,
    verificationStatus: VERIFICATION_STATUSES.PENDING_VERIFICATION,
  });
});

test("pending users fail verified-user middleware", () => {
  const req = {
    user: {
      verificationStatus: VERIFICATION_STATUSES.PENDING_VERIFICATION,
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requireVerifiedUser(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("page access middleware blocks restricted pages", () => {
  const req = {
    user: {
      pageAccess: {
        [PAGE_KEYS.DASHBOARD]: true,
        [PAGE_KEYS.SCANNER]: false,
      },
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requirePageAccess(PAGE_KEYS.SCANNER)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("level 2 admins cannot satisfy level 3 role middleware", () => {
  const req = {
    user: {
      role: USER_ROLES.LEVEL_2_ADMIN,
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requireRole(USER_ROLES.LEVEL_3_OWNER_ADMIN)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("verified users get their allowed broker page and explicit restrictions", () => {
  const pageAccess = buildPageAccessMap({
    role: USER_ROLES.LEVEL_2_ADMIN,
    pageAccessEntries: [
      {
        pageKey: PAGE_KEYS.BROKER,
        allowed: false,
      },
    ],
  });

  assert.equal(pageAccess[PAGE_KEYS.PLAYBOOK], true);
  assert.equal(pageAccess[PAGE_KEYS.BROKER], false);
});

test("level 3 owner admin can verify and promote another user", async () => {
  const { prisma } = createFakeAdminPrisma([
    {
      id: "owner-1",
      email: OWNER_ADMIN_EMAIL,
      name: "Owner",
      role: USER_ROLES.LEVEL_3_OWNER_ADMIN,
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      role: USER_ROLES.LEVEL_1_USER,
      verificationStatus: VERIFICATION_STATUSES.PENDING_VERIFICATION,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const service = createAdminService({ prisma });
  const verified = await service.verifyUser("owner-1", "user-1");
  const promoted = await service.updateRole("owner-1", "user-1", USER_ROLES.LEVEL_3_OWNER_ADMIN);

  assert.equal(verified.verificationStatus, VERIFICATION_STATUSES.VERIFIED);
  assert.equal(promoted.role, USER_ROLES.LEVEL_3_OWNER_ADMIN);
});

test("the only level 3 owner admin cannot demote or suspend self", async () => {
  const { prisma } = createFakeAdminPrisma([
    {
      id: "owner-1",
      email: OWNER_ADMIN_EMAIL,
      name: "Owner",
      role: USER_ROLES.LEVEL_3_OWNER_ADMIN,
      verificationStatus: VERIFICATION_STATUSES.VERIFIED,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const service = createAdminService({ prisma });

  await assert.rejects(
    () => service.updateRole("owner-1", "owner-1", USER_ROLES.LEVEL_2_ADMIN),
    /only Level 3 owner admin cannot be demoted/i
  );
  await assert.rejects(
    () => service.suspendUser("owner-1", "owner-1", "nope"),
    /cannot suspend yourself/i
  );
});

test("owner seed email is fixed to arjunven01@gmail.com", () => {
  assert.equal(OWNER_ADMIN_EMAIL, "arjunven01@gmail.com");
});
