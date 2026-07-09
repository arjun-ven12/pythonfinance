const crypto = require("crypto");
const { redactSensitive } = require("../services/redactionService");

function requestLogger(req, res, next) {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.info(
      JSON.stringify({
        type: "http_request",
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
        userId: req.user?.id || null,
        headers: redactSensitive({
          authorization: req.headers.authorization || null,
          cookie: req.headers.cookie || null,
          "x-csrf-token": req.headers["x-csrf-token"] || null,
        }),
      })
    );
  });

  next();
}

module.exports = requestLogger;
