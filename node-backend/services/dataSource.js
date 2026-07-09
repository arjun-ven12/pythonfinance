const JSON_FALLBACK_WARNING =
  "Database unavailable; live data is unavailable. Runtime JSON was not used.";

function withPrismaSource(payload) {
  return {
    ...payload,
    dataSource: "PRISMA",
    degradedMode: false,
  };
}

function withJsonFallback(payload, error = null) {
  return {
    ...payload,
    dataSource: "UNAVAILABLE",
    degradedMode: true,
    stale: true,
    jsonFallbackActive: false,
    warning: JSON_FALLBACK_WARNING,
    ...(error ? { fallbackError: error.message } : {}),
  };
}

module.exports = {
  JSON_FALLBACK_WARNING,
  withJsonFallback,
  withPrismaSource,
};
