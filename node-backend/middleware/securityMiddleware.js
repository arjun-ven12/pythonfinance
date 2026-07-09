const cors = require("cors");
const helmet = require("helmet");
const { getRuntimeGuardStatus } = require("../config/runtimeGuard");
const { getAllowedOrigins, getBackendOrigin } = require("../config/security");

const DEFAULT_HSTS_MAX_AGE = 15_552_000;

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(value) {
  try {
    const url = new URL(value);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return null;
  }
}

function createCorsMiddleware() {
  const allowedOrigins = new Set(getAllowedOrigins().map(normalizeOrigin).filter(Boolean));

  return cors({
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id", "X-CSRF-Token"],
    exposedHeaders: [
      "X-Request-Id",
      "X-Data-Source",
      "X-Degraded-Mode",
    ],
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      console.warn(
        JSON.stringify({
          type: "cors_blocked",
          origin,
        })
      );
      const error = new Error("Origin is not allowed by CORS.");
      error.statusCode = 403;
      callback(error);
    },
  });
}

function buildCspDirectives() {
  const allowedOrigins = getAllowedOrigins();
  const backendOrigin = getBackendOrigin();
  const websocketOrigins = [
    toWebSocketOrigin(backendOrigin),
    ...allowedOrigins.map((origin) => toWebSocketOrigin(origin)),
  ].filter(Boolean);
  const isProduction = process.env.NODE_ENV === "production";
  const developmentConnections =
    process.env.NODE_ENV === "production"
      ? []
      : [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "ws://localhost:5173",
          "ws://127.0.0.1:5173",
        ];

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    // Vite injects an inline React-refresh bootstrap in development.
    scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
    // React style attributes and chart libraries currently require inline styles.
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: [
      "'self'",
      backendOrigin,
      ...allowedOrigins,
      ...websocketOrigins,
      ...developmentConnections,
    ],
    workerSrc: ["'self'", "blob:"],
    reportUri: [`${backendOrigin}/api/security/csp-report`],
    upgradeInsecureRequests:
      isProduction ? [] : null,
  };
}

function getHstsConfig() {
  const enabled =
    process.env.HSTS_ENABLED === "true" ||
    (process.env.HSTS_ENABLED !== "false" && process.env.NODE_ENV === "production");
  const maxAge = Number.parseInt(process.env.HSTS_MAX_AGE, 10);

  return {
    enabled,
    maxAge: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_HSTS_MAX_AGE,
    includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS === "true",
    preload: process.env.HSTS_PRELOAD === "true",
  };
}

function getCspMode() {
  if (process.env.CSP_DISABLED === "true") {
    return "DISABLED";
  }

  if (process.env.NODE_ENV === "production") {
    return process.env.CSP_REPORT_ONLY === "true" ? "REPORT_ONLY" : "ENFORCE";
  }

  return process.env.CSP_REPORT_ONLY === "true" ? "REPORT_ONLY" : "REPORT_ONLY";
}

function createHelmetMiddleware() {
  const cspMode = getCspMode();
  const hsts = getHstsConfig();

  return helmet({
    contentSecurityPolicy:
      cspMode === "DISABLED"
        ? false
        : {
            directives: buildCspDirectives(),
            reportOnly: cspMode === "REPORT_ONLY",
          },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: hsts.enabled
      ? {
          maxAge: hsts.maxAge,
          includeSubDomains: hsts.includeSubDomains,
          preload: hsts.preload,
        }
      : false,
    xssFilter: true,
  });
}

function browserSecurityHeaders(req, res, next) {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  );

  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
  }

  next();
}

function securityDiagnostics() {
  const cspMode = getCspMode();
  const cspDirectives = buildCspDirectives();
  const hsts = getHstsConfig();

  return {
    cspMode,
    cspAllowsInlineStyles: (cspDirectives.styleSrc || []).includes("'unsafe-inline'"),
    cspAllowsInlineScripts: (cspDirectives.scriptSrc || []).includes("'unsafe-inline'"),
    cspReportUri: cspDirectives.reportUri?.[0] || null,
    corsCredentials: true,
    hsts: {
      configuredByApp: hsts.enabled,
      handledByEdge: false,
      maxAge: hsts.enabled ? hsts.maxAge : null,
      includeSubDomains: hsts.enabled ? hsts.includeSubDomains : false,
      preload: hsts.enabled ? hsts.preload : false,
    },
    allowedOrigins: getAllowedOrigins(),
    testRuntimeAllowed: getRuntimeGuardStatus().testRuntimeAllowed,
    cookies: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      accessTokenMinutes: 15,
      refreshTokenDays: 7,
    },
    disabledProtections: [
      {
        protection: "crossOriginEmbedderPolicy",
        reason:
          "Disabled for compatibility with cross-origin development assets and chart rendering.",
      },
      {
        protection: "style-src unsafe-inline",
        reason:
          "Temporarily allowed because the React cockpit and chart libraries use inline style attributes.",
      },
      ...(process.env.NODE_ENV === "production"
        ? []
        : [
            {
              protection: "development script-src unsafe-inline",
              reason:
                "Vite injects an inline React-refresh bootstrap in development only; production remains strict.",
            },
          ]),
    ],
  };
}

module.exports = {
  browserSecurityHeaders,
  buildCspDirectives,
  createCorsMiddleware,
  createHelmetMiddleware,
  getCspMode,
  getHstsConfig,
  securityDiagnostics,
};
