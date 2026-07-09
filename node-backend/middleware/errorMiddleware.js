function notFoundMiddleware(req, res) {
  res.status(404).json({
    error: "Endpoint not found.",
    requestId: req.requestId || null,
  });
}

function errorMiddleware(error, req, res, _next) {
  const statusCode = error.statusCode || error.status || 500;

  console.error(
    JSON.stringify({
      type: "http_error",
      requestId: req.requestId || null,
      method: req.method,
      path: req.originalUrl,
      status: statusCode,
      message: error.message,
    })
  );

  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error." : error.message,
    requestId: req.requestId || null,
  });
}

module.exports = {
  errorMiddleware,
  notFoundMiddleware,
};
