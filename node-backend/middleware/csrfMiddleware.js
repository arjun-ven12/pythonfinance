const {
  isAllowedOrigin,
  resolveCsrfSessionBinding,
  verifyCsrfToken,
} = require("../services/csrfTokenService");

const CSRF_EXEMPT_PATH_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/csrf",
  "/api/security/csp-report",
];

function isUnsafeMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(
    String(method || "").toUpperCase()
  );
}

function isCsrfExemptPath(pathname) {
  return CSRF_EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function createCsrfProtectionMiddleware() {
  return function csrfProtection(req, res, next) {
    if (!isUnsafeMethod(req.method) || isCsrfExemptPath(req.path || req.originalUrl || "")) {
      next();
      return;
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const csrfToken = req.headers["x-csrf-token"];

    if (origin && !isAllowedOrigin(origin)) {
      res.status(403).json({ error: "Invalid CSRF origin." });
      return;
    }

    if (!origin && referer) {
      const refererOrigin = (() => {
        try {
          return new URL(referer).origin;
        } catch {
          return null;
        }
      })();

      if (!refererOrigin || !isAllowedOrigin(refererOrigin)) {
        res.status(403).json({ error: "Invalid CSRF referer." });
        return;
      }
    }

    const verification = verifyCsrfToken(
      csrfToken,
      resolveCsrfSessionBinding(req)
    );

    if (!verification.valid) {
      res.status(403).json({ error: verification.reason || "Invalid CSRF token." });
      return;
    }

    req.csrf = {
      verified: true,
      issuedAt: verification.issuedAt,
    };
    next();
  };
}

module.exports = {
  createCsrfProtectionMiddleware,
  isCsrfExemptPath,
};
