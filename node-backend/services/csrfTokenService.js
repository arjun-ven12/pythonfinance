const crypto = require("node:crypto");
const { getAllowedOrigins } = require("../config/security");
const { getJwtSecret } = require("../middleware/authMiddleware");
const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} = require("./authTokenService");

const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const PUBLIC_CSRF_BINDING = "public";

function hashBindingValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createCsrfSecret() {
  return crypto
    .createHash("sha256")
    .update(`${getJwtSecret()}:csrf`)
    .digest("hex");
}

function signCsrfPayload(payload, sessionBinding = PUBLIC_CSRF_BINDING) {
  return crypto
    .createHmac("sha256", createCsrfSecret())
    .update(`${sessionBinding}.${payload}`)
    .digest("base64url");
}

function getCsrfSessionBindingFromCookies(cookies = {}) {
  if (cookies?.[ACCESS_COOKIE_NAME]) {
    return `access:${hashBindingValue(cookies[ACCESS_COOKIE_NAME])}`;
  }

  if (cookies?.[REFRESH_COOKIE_NAME]) {
    return `refresh:${hashBindingValue(cookies[REFRESH_COOKIE_NAME])}`;
  }

  return PUBLIC_CSRF_BINDING;
}

function resolveCsrfSessionBinding(req) {
  return getCsrfSessionBindingFromCookies(req?.cookies || {});
}

function issueCsrfToken(sessionBinding = PUBLIC_CSRF_BINDING) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(24).toString("base64url");
  const payload = `${timestamp}.${nonce}`;
  const signature = signCsrfPayload(payload, sessionBinding);
  return `${payload}.${signature}`;
}

function verifyCsrfToken(token, sessionBinding = PUBLIC_CSRF_BINDING) {
  const [timestamp, nonce, signature] = String(token || "").split(".");

  if (!timestamp || !nonce || !signature) {
    return { valid: false, reason: "Malformed CSRF token." };
  }

  const issuedAt = Number(timestamp);

  if (!Number.isFinite(issuedAt)) {
    return { valid: false, reason: "Invalid CSRF token timestamp." };
  }

  if (Date.now() - issuedAt > CSRF_TOKEN_TTL_MS) {
    return { valid: false, reason: "CSRF token expired." };
  }

  const payload = `${timestamp}.${nonce}`;
  const expectedSignature = signCsrfPayload(payload, sessionBinding);

  if (!safeEqual(signature, expectedSignature)) {
    return { valid: false, reason: "Invalid CSRF token for this session." };
  }

  return {
    valid: true,
    issuedAt,
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return false;

  try {
    const normalized = new URL(origin).origin;
    return new Set(getAllowedOrigins()).has(normalized);
  } catch {
    return false;
  }
}

module.exports = {
  CSRF_TOKEN_TTL_MS,
  PUBLIC_CSRF_BINDING,
  getCsrfSessionBindingFromCookies,
  isAllowedOrigin,
  issueCsrfToken,
  resolveCsrfSessionBinding,
  verifyCsrfToken,
};
