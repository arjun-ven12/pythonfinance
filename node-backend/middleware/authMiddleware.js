const jwt = require("jsonwebtoken");
const prisma = require("../services/prisma");
const {
  buildPageAccessMap,
} = require("./accessControl");

const ACCESS_COOKIE_NAME = "trading_access";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured in node-backend/.env.");
  }

  return secret;
}

function toSafeUser(user) {
  if (!user) {
    return null;
  }

  const pageAccess = buildPageAccessMap(user);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isDemoMode: false,
    role: user.role,
    verificationStatus: user.verificationStatus,
    verifiedAt: user.verifiedAt,
    verifiedByUserId: user.verifiedByUserId,
    rejectedAt: user.rejectedAt,
    rejectedReason: user.rejectedReason,
    lastRoleChangedAt: user.lastRoleChangedAt,
    roleChangedByUserId: user.roleChangedByUserId,
    lastLoginAt: user.lastLoginAt,
    pageAccess,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE_NAME];

    if (!token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const payload = jwt.verify(token, getJwtSecret());

    if (payload.tokenType && payload.tokenType !== "access") {
      res.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    const user = await prisma.run((db) =>
      db.user.findUnique({
        where: { id: payload.userId },
        include: {
          pageAccessEntries: true,
        },
      })
    );

    if (!user) {
      res.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    req.user = toSafeUser(user);
    next();
  } catch (_error) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = {
  authMiddleware,
  getJwtSecret,
  toSafeUser,
};
