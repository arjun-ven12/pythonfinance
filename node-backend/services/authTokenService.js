const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../middleware/authMiddleware");

const ACCESS_COOKIE_NAME = "trading_access";
const REFRESH_COOKIE_NAME = "trading_refresh";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      tokenType: "access",
    },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? "none" : "lax",
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: "/",
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? "none" : "lax",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: "/api/auth",
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, accessCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

module.exports = {
  ACCESS_COOKIE_NAME,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  clearAuthCookies,
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  setAuthCookies,
};
