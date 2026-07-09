const { rateLimit } = require("express-rate-limit");

function jsonRateLimitHandler(req, res) {
  console.warn(
    JSON.stringify({
      type: "auth_rate_limited",
      requestId: req.requestId || null,
      path: req.originalUrl,
      ip: req.ip,
    })
  );
  res.status(429).json({
    error: "Too many authentication attempts. Please try again later.",
    requestId: req.requestId || null,
  });
}

function createAuthRateLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: jsonRateLimitHandler,
  });
}

const loginRateLimiter = createAuthRateLimiter(5);
const registerRateLimiter = createAuthRateLimiter(3);

module.exports = {
  createAuthRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
};
