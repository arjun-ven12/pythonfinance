const PAGE_KEYS = Object.freeze({
  DASHBOARD: "DASHBOARD",
  SCANNER: "SCANNER",
  WATCHLIST: "WATCHLIST",
  STRATEGY_LAB: "STRATEGY_LAB",
  RESEARCH: "RESEARCH",
  PLAYBOOK: "PLAYBOOK",
  VALIDATION: "VALIDATION",
  BROKER: "BROKER",
  ALERTS: "ALERTS",
  TRADES: "TRADES",
  APPROVALS: "APPROVALS",
  PORTFOLIO: "PORTFOLIO",
  SETTINGS: "SETTINGS",
  ADMIN_DASHBOARD: "ADMIN_DASHBOARD",
});

const USER_ROLES = Object.freeze({
  LEVEL_1_USER: "LEVEL_1_USER",
  LEVEL_2_ADMIN: "LEVEL_2_ADMIN",
  LEVEL_3_OWNER_ADMIN: "LEVEL_3_OWNER_ADMIN",
});

const VERIFICATION_STATUSES = Object.freeze({
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
});

const ROLE_ORDER = {
  [USER_ROLES.LEVEL_1_USER]: 1,
  [USER_ROLES.LEVEL_2_ADMIN]: 2,
  [USER_ROLES.LEVEL_3_OWNER_ADMIN]: 3,
};

const LEVEL_1_DEFAULT_PAGES = [
  PAGE_KEYS.DASHBOARD,
  PAGE_KEYS.SCANNER,
  PAGE_KEYS.WATCHLIST,
  PAGE_KEYS.STRATEGY_LAB,
  PAGE_KEYS.RESEARCH,
  PAGE_KEYS.ALERTS,
  PAGE_KEYS.TRADES,
  PAGE_KEYS.APPROVALS,
  PAGE_KEYS.PORTFOLIO,
  PAGE_KEYS.SETTINGS,
];

const LEVEL_2_DEFAULT_PAGES = [
  ...LEVEL_1_DEFAULT_PAGES,
  PAGE_KEYS.PLAYBOOK,
  PAGE_KEYS.VALIDATION,
  PAGE_KEYS.BROKER,
];

const LEVEL_3_DEFAULT_PAGES = Object.values(PAGE_KEYS);

function getDefaultAllowedPages(role) {
  if (role === USER_ROLES.LEVEL_3_OWNER_ADMIN) {
    return LEVEL_3_DEFAULT_PAGES;
  }

  if (role === USER_ROLES.LEVEL_2_ADMIN) {
    return LEVEL_2_DEFAULT_PAGES;
  }

  return LEVEL_1_DEFAULT_PAGES;
}

function buildPageAccessMap(user) {
  const resolved = Object.fromEntries(
    Object.values(PAGE_KEYS).map((pageKey) => [pageKey, false])
  );

  for (const pageKey of getDefaultAllowedPages(user?.role)) {
    resolved[pageKey] = true;
  }

  for (const entry of user?.pageAccessEntries || []) {
    if (entry?.pageKey) {
      resolved[entry.pageKey] = Boolean(entry.allowed);
    }
  }

  return resolved;
}

function toVerificationError(status) {
  switch (status) {
    case VERIFICATION_STATUSES.PENDING_VERIFICATION:
      return "Your account is pending verification.";
    case VERIFICATION_STATUSES.REJECTED:
      return "Your account was rejected.";
    case VERIFICATION_STATUSES.SUSPENDED:
      return "Your account is suspended.";
    default:
      return "Verified access is required.";
  }
}

function requireVerifiedUser(req, res, next) {
  if (req.user?.verificationStatus === VERIFICATION_STATUSES.VERIFIED) {
    next();
    return;
  }

  res.status(403).json({
    error: toVerificationError(req.user?.verificationStatus),
    verificationStatus: req.user?.verificationStatus || null,
  });
}

function requireDemoAccess(req, _res, next) {
  req.demoAccess = {
    isDemoMode: true,
  };
  next();
}

function blockDemoMutation(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || req.path === "/reset-session") {
    next();
    return;
  }

  res.status(405).json({
    error: "Demo mode is read-only.",
    isDemoMode: true,
  });
}

function requireRole(requiredRole) {
  return (req, res, next) => {
    const currentRank = ROLE_ORDER[req.user?.role] || 0;
    const requiredRank = ROLE_ORDER[requiredRole] || Number.MAX_SAFE_INTEGER;

    if (currentRank >= requiredRank) {
      next();
      return;
    }

    res.status(403).json({
      error: "You do not have permission to perform this action.",
      requiredRole,
    });
  };
}

function requirePageAccess(pageKeyOrPageKeys) {
  const pageKeys = Array.isArray(pageKeyOrPageKeys)
    ? pageKeyOrPageKeys
    : [pageKeyOrPageKeys];

  return (req, res, next) => {
    const pageAccess = req.user?.pageAccess || {};
    const hasAccess = pageKeys.some((pageKey) => Boolean(pageAccess[pageKey]));

    if (hasAccess) {
      next();
      return;
    }

    res.status(403).json({
      error: "You do not have access to this page.",
      pageKeys,
    });
  };
}

module.exports = {
  PAGE_KEYS,
  USER_ROLES,
  VERIFICATION_STATUSES,
  buildPageAccessMap,
  getDefaultAllowedPages,
  blockDemoMutation,
  requirePageAccess,
  requireDemoAccess,
  requireRole,
  requireVerifiedUser,
};
