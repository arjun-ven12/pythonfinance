const bcrypt = require("bcryptjs");
const { toSafeUser } = require("../middleware/authMiddleware");
const prisma = require("./prisma");
const {
  REFRESH_TOKEN_TTL_SECONDS,
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
} = require("./authTokenService");
const {
  USER_ROLES,
  VERIFICATION_STATUSES,
} = require("../middleware/accessControl");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH =
  "$2b$12$6dFv7vknvRCamv3QWj6bO.iaQZQj7xWg7cWsPzWbUJa0cA1ePsZ8u";
const DEFAULT_NEW_USER_STATE = Object.freeze({
  role: USER_ROLES.LEVEL_1_USER,
  verificationStatus: VERIFICATION_STATUSES.PENDING_VERIFICATION,
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validatePassword(password) {
  const failures = [];

  if (password.length < 12) failures.push("at least 12 characters");
  if (!/[a-z]/.test(password)) failures.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) failures.push("an uppercase letter");
  if (!/\d/.test(password)) failures.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("a symbol");

  if (failures.length > 0) {
    throw createHttpError(
      400,
      `Password must contain ${failures.join(", ")}.`
    );
  }
}

function getClientContext(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
  };
}

function logAuthEvent(req, event, details = {}) {
  console.info(
    JSON.stringify({
      type: "auth_event",
      event,
      requestId: req.requestId || null,
      ip: req.ip || null,
      ...details,
    })
  );
}

async function createSession(user, context = {}) {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.run((db) =>
    db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
      },
    })
  );

  return {
    accessToken: createAccessToken(user),
    refreshToken,
    user: toSafeUser({
      ...user,
      pageAccessEntries: user.pageAccessEntries || [],
    }),
  };
}

async function registerUser(
  { name: rawName, email: rawEmail, password: rawPassword },
  context = {}
) {
  const name = String(rawName || "").trim();
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword || "");

  if (!name || !email || !password) {
    throw createHttpError(400, "Name, email, and password are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createHttpError(400, "A valid email is required.");
  }

  validatePassword(password);

  const existingUser = await prisma.run((db) =>
    db.user.findUnique({ where: { email } })
  );

  if (existingUser) {
    throw createHttpError(409, "A user with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.run((db) =>
    db.user.create({
      data: {
        name,
        email,
        passwordHash,
        ...DEFAULT_NEW_USER_STATE,
      },
      include: {
        pageAccessEntries: true,
      },
    })
  );

  return createSession(user, context);
}

async function recordFailedLogin(user) {
  if (!user) {
    return;
  }

  const update = getFailedLoginUpdate(user.failedLoginAttempts);

  await prisma.run((db) =>
    db.user.update({
      where: { id: user.id },
      data: update,
    })
  );
}

function getFailedLoginUpdate(currentAttempts, now = Date.now()) {
  const attempts = (currentAttempts || 0) + 1;
  const lockedUntil =
    attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now + LOCK_DURATION_MS)
      : null;

  return {
    failedLoginAttempts: lockedUntil ? 0 : attempts,
    lockedUntil,
  };
}

async function loginUser(
  { email: rawEmail, password: rawPassword },
  context = {}
) {
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword || "");

  if (!email || !password) {
    throw createHttpError(400, "Email and password are required.");
  }

  const user = await prisma.run((db) =>
    db.user.findUnique({
      where: { email },
      include: {
        pageAccessEntries: true,
      },
    })
  );

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw createHttpError(
      423,
      "Account temporarily locked. Please try again after the cooldown."
    );
  }

  const passwordMatches = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    await recordFailedLogin(user);
    throw createHttpError(401, "Invalid email or password.");
  }

  const loginTimestamp = new Date();

  if (user.failedLoginAttempts || user.lockedUntil) {
    await prisma.run((db) =>
      db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: loginTimestamp,
        },
      })
    );
  } else {
    await prisma.run((db) =>
      db.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: loginTimestamp,
        },
      })
    );
  }

  return createSession(
    {
      ...user,
      lastLoginAt: loginTimestamp,
    },
    context
  );
}

async function rotateRefreshToken(rawToken, context = {}) {
  if (!rawToken) {
    throw createHttpError(401, "Refresh session required.");
  }

  const tokenHash = hashRefreshToken(rawToken);
  const storedToken = await prisma.run((db) =>
    db.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            pageAccessEntries: true,
          },
        },
      },
    })
  );

  if (
    !storedToken ||
    storedToken.revokedAt ||
    storedToken.expiresAt <= new Date()
  ) {
    throw createHttpError(401, "Refresh session is invalid or expired.");
  }

  const nextRefreshToken = createRefreshToken();
  const nextTokenHash = hashRefreshToken(nextRefreshToken);
  const nextTokenId = cryptoRandomId();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.run((db) =>
    db.$transaction([
      db.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
          replacedByTokenId: nextTokenId,
        },
      }),
      db.refreshToken.create({
        data: {
          id: nextTokenId,
          userId: storedToken.userId,
          tokenHash: nextTokenHash,
          expiresAt,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        },
      }),
    ])
  );

  return {
    accessToken: createAccessToken(storedToken.user),
    refreshToken: nextRefreshToken,
    user: toSafeUser({
      ...storedToken.user,
      pageAccessEntries: storedToken.user.pageAccessEntries || [],
    }),
  };
}

function cryptoRandomId() {
  return require("crypto").randomUUID();
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) {
    return false;
  }

  const result = await prisma.run((db) =>
    db.refreshToken.updateMany({
      where: {
        tokenHash: hashRefreshToken(rawToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })
  );

  return result.count > 0;
}

module.exports = {
  createHttpError,
  DEFAULT_NEW_USER_STATE,
  getFailedLoginUpdate,
  getClientContext,
  logAuthEvent,
  loginUser,
  normalizeEmail,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  validatePassword,
};
