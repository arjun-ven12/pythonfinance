const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const configured = parseList(process.env.CORS_ALLOWED_ORIGINS);

  if (configured.length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    return parseList(process.env.FRONTEND_URL);
  }

  return DEFAULT_DEV_ORIGINS;
}

function getBackendOrigin() {
  return (
    process.env.BACKEND_URL ||
    `http://localhost:${Number.parseInt(process.env.PORT, 10) || 3000}`
  );
}

module.exports = {
  DEFAULT_DEV_ORIGINS,
  getAllowedOrigins,
  getBackendOrigin,
  parseList,
};
