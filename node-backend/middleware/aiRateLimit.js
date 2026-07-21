const { ipKeyGenerator, rateLimit } = require("express-rate-limit");

function aiRateLimitHandler(req, res) {
  res.status(429).json({
    error: "AI request limit reached. Please try again shortly.",
    requestId: req.requestId || null,
  });
}

function createAiRateLimiter({ limit = 30, windowMs = 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
    handler: aiRateLimitHandler,
  });
}

function createInternalAiRateLimiter({ limit = 300 } = {}) {
  return createAiRateLimiter({ limit });
}

module.exports = {
  createAiRateLimiter,
  createInternalAiRateLimiter,
};
