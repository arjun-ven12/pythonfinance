const { ipKeyGenerator, rateLimit } = require("express-rate-limit");

function aiRateLimitHandler(req, res) {
  res.status(429).json({
    error: "AI request limit reached. Please try again shortly.",
    requestId: req.requestId || null,
  });
}

function createAiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
    handler: aiRateLimitHandler,
  });
}

module.exports = {
  createAiRateLimiter,
};
