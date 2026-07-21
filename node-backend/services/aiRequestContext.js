const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

function aiRequestContextMiddleware(req, _res, next) {
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  storage.run({
    requestId: req.requestId || null,
    endpoint: `${String(req.method || "").toUpperCase()} ${path}`.trim(),
  }, next);
}

function getAiRequestContext() {
  return storage.getStore() || {};
}

module.exports = {
  aiRequestContextMiddleware,
  getAiRequestContext,
};
