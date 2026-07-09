const express = require("express");
const { authMiddleware } = require("../../../middleware/authMiddleware");
const { createAdminService } = require("../../admin/services/admin.service");
const {
  loginRateLimiter,
  registerRateLimiter,
} = require("../../../middleware/authRateLimit");
const {
  getClientContext,
  logAuthEvent,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} = require("../../../services/authService");
const {
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies,
} = require("../../../services/authTokenService");
const {
  issueCsrfToken,
  resolveCsrfSessionBinding,
} = require("../../../services/csrfTokenService");
const prisma = require("../../../services/prisma");

const router = express.Router();
const adminService = createAdminService({ prisma });

function sendSession(res, session, statusCode = 200) {
  setAuthCookies(res, session.accessToken, session.refreshToken);
  res.status(statusCode).json({
    user: session.user,
  });
}

router.post("/register", registerRateLimiter, async (req, res, next) => {
  try {
    const session = await registerUser(req.body || {}, getClientContext(req));
    logAuthEvent(req, "register_success", { userId: session.user.id });
    sendSession(res, session, 201);
  } catch (error) {
    logAuthEvent(req, "register_failure", { reason: error.message });
    next(error);
  }
});

router.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const session = await loginUser(req.body || {}, getClientContext(req));
    logAuthEvent(req, "login_success", { userId: session.user.id });
    sendSession(res, session);
  } catch (error) {
    logAuthEvent(req, "login_failure", { reason: error.message });
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const session = await rotateRefreshToken(
      req.cookies?.[REFRESH_COOKIE_NAME],
      getClientContext(req)
    );
    logAuthEvent(req, "refresh_success", { userId: session.user.id });
    sendSession(res, session);
  } catch (error) {
    clearAuthCookies(res);
    logAuthEvent(req, "refresh_failure", { reason: error.message });
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    try {
      await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE_NAME]);
    } catch (error) {
      logAuthEvent(req, "logout_revoke_failure", { reason: error.message });
    }
    clearAuthCookies(res);
    logAuthEvent(req, "logout");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/csrf", (req, res) => {
  res.json({ csrfToken: issueCsrfToken(resolveCsrfSessionBinding(req)) });
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

router.patch("/admin-mode", authMiddleware, async (req, res, next) => {
  try {
    const user = await adminService.enableAdminModeForUser(req.user.id);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
