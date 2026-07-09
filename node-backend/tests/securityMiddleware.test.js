const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const cookieParser = require("cookie-parser");
const express = require("express");
const {
  createCorsMiddleware,
  createHelmetMiddleware,
  getCspMode,
  getHstsConfig,
  securityDiagnostics,
} = require("../middleware/securityMiddleware");
const { createCsrfProtectionMiddleware } = require("../middleware/csrfMiddleware");
const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies,
} = require("../services/authTokenService");
const {
  getCsrfSessionBindingFromCookies,
  issueCsrfToken,
} = require("../services/csrfTokenService");
const {
  getFailedLoginUpdate,
  validatePassword,
} = require("../services/authService");

async function withSecurityServer(callback) {
  const app = express();
  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware());
  app.get("/ok", (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("CORS allows the configured development frontend with credentials", async () => {
  await withSecurityServer(async (origin) => {
    const response = await fetch(`${origin}/ok`, {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:5173"
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true"
    );
  });
});

test("CORS allows CSRF headers for browser API requests", async () => {
  await withSecurityServer(async (origin) => {
    const response = await fetch(`${origin}/ok`, {
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-csrf-token",
      },
      method: "OPTIONS",
    });

    assert.equal(response.status, 204);
    assert.match(
      response.headers.get("access-control-allow-headers") || "",
      /X-CSRF-Token/i
    );
  });
});

test("CORS rejects unknown browser origins", async () => {
  await withSecurityServer(async (origin) => {
    const response = await fetch(`${origin}/ok`, {
      headers: { Origin: "https://attacker.example" },
    });

    assert.equal(response.status, 403);
  });
});

test("Helmet emits enforcing CSP headers in production by default", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousReportOnly = process.env.CSP_REPORT_ONLY;
  process.env.NODE_ENV = "production";
  delete process.env.CSP_REPORT_ONLY;

  try {
    await withSecurityServer(async (origin) => {
      const response = await fetch(`${origin}/ok`);

      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        response.headers.get("referrer-policy"),
        "strict-origin-when-cross-origin"
      );
      assert.match(
        response.headers.get("content-security-policy"),
        /default-src 'self'/
      );
      assert.equal(response.headers.get("content-security-policy-report-only"), null);
      assert.equal(response.headers.get("x-powered-by"), null);
    });
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.CSP_REPORT_ONLY = previousReportOnly;
  }
});

test("production security middleware emits Strict-Transport-Security when app HSTS is enabled", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousHstsEnabled = process.env.HSTS_ENABLED;
  const previousMaxAge = process.env.HSTS_MAX_AGE;
  const previousIncludeSubdomains = process.env.HSTS_INCLUDE_SUBDOMAINS;
  const previousPreload = process.env.HSTS_PRELOAD;
  process.env.NODE_ENV = "production";
  delete process.env.HSTS_ENABLED;
  process.env.HSTS_MAX_AGE = "15552000";
  process.env.HSTS_INCLUDE_SUBDOMAINS = "false";
  process.env.HSTS_PRELOAD = "false";

  try {
    await withSecurityServer(async (origin) => {
      const response = await fetch(`${origin}/ok`);

      assert.equal(
        response.headers.get("strict-transport-security"),
        "max-age=15552000"
      );
    });
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.HSTS_ENABLED = previousHstsEnabled;
    process.env.HSTS_MAX_AGE = previousMaxAge;
    process.env.HSTS_INCLUDE_SUBDOMAINS = previousIncludeSubdomains;
    process.env.HSTS_PRELOAD = previousPreload;
  }
});

test("development does not emit HSTS unless explicitly enabled", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousHstsEnabled = process.env.HSTS_ENABLED;
  process.env.NODE_ENV = "development";
  delete process.env.HSTS_ENABLED;

  try {
    await withSecurityServer(async (origin) => {
      const response = await fetch(`${origin}/ok`);
      assert.equal(response.headers.get("strict-transport-security"), null);
    });
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.HSTS_ENABLED = previousHstsEnabled;
  }
});

test("Helmet emits report-only CSP headers only when explicitly configured", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousReportOnly = process.env.CSP_REPORT_ONLY;
  process.env.NODE_ENV = "production";
  process.env.CSP_REPORT_ONLY = "true";

  try {
    await withSecurityServer(async (origin) => {
      const response = await fetch(`${origin}/ok`);

      assert.match(
        response.headers.get("content-security-policy-report-only"),
        /default-src 'self'/
      );
      assert.equal(response.headers.get("content-security-policy"), null);
    });
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.CSP_REPORT_ONLY = previousReportOnly;
  }
});

test("CSP mode diagnostics match environment settings", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousReportOnly = process.env.CSP_REPORT_ONLY;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.CSP_REPORT_ONLY;
    assert.equal(getCspMode(), "ENFORCE");

    process.env.CSP_REPORT_ONLY = "true";
    assert.equal(getCspMode(), "REPORT_ONLY");

    process.env.NODE_ENV = "development";
    assert.equal(getCspMode(), "REPORT_ONLY");
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.CSP_REPORT_ONLY = previousReportOnly;
  }
});

test("HSTS diagnostics match actual app config", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousHstsEnabled = process.env.HSTS_ENABLED;
  const previousMaxAge = process.env.HSTS_MAX_AGE;
  const previousIncludeSubdomains = process.env.HSTS_INCLUDE_SUBDOMAINS;
  const previousPreload = process.env.HSTS_PRELOAD;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.HSTS_ENABLED;
    process.env.HSTS_MAX_AGE = "31536000";
    process.env.HSTS_INCLUDE_SUBDOMAINS = "false";
    process.env.HSTS_PRELOAD = "false";

    const hsts = getHstsConfig();
    const diagnostics = securityDiagnostics();

    assert.equal(hsts.enabled, true);
    assert.equal(diagnostics.hsts.configuredByApp, true);
    assert.equal(diagnostics.hsts.maxAge, 31536000);
    assert.equal(diagnostics.hsts.includeSubDomains, false);
    assert.equal(diagnostics.hsts.preload, false);
    assert.equal(diagnostics.hsts.handledByEdge, false);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.HSTS_ENABLED = previousHstsEnabled;
    process.env.HSTS_MAX_AGE = previousMaxAge;
    process.env.HSTS_INCLUDE_SUBDOMAINS = previousIncludeSubdomains;
    process.env.HSTS_PRELOAD = previousPreload;
  }
});

test("development report-only CSP still includes reporting endpoint", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    await withSecurityServer(async (origin) => {
    const response = await fetch(`${origin}/ok`);

      assert.match(
        response.headers.get("content-security-policy-report-only"),
        /report-uri http:\/\/localhost:3000\/api\/security\/csp-report/
      );
    });
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }
});

test("authentication cookies are HttpOnly and cleared with matching paths", () => {
  const calls = [];
  const res = {
    cookie(name, value, options) {
      calls.push({ action: "set", name, value, options });
    },
    clearCookie(name, options) {
      calls.push({ action: "clear", name, options });
    },
  };

  setAuthCookies(res, "access", "refresh");
  clearAuthCookies(res);

  assert.equal(calls[0].options.httpOnly, true);
  assert.equal(calls[0].options.sameSite, "lax");
  assert.equal(calls[1].options.httpOnly, true);
  assert.equal(calls[1].options.path, "/api/auth");
  assert.equal(calls[2].options.path, "/");
  assert.equal(calls[3].options.path, "/api/auth");
});

test("production authentication cookies require HTTPS", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const calls = [];
  const res = {
    cookie(name, _value, options) {
      calls.push({ name, options });
    },
  };

  process.env.NODE_ENV = "production";
  try {
    setAuthCookies(res, "access", "refresh");
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.secure === true), true);
  assert.equal(calls.every((call) => call.options.sameSite === "none"), true);
});

test("password policy requires length and mixed character classes", () => {
  assert.throws(() => validatePassword("short"), /12 characters/);
  assert.throws(() => validatePassword("alllowercase12!"), /uppercase/);
  assert.doesNotThrow(() => validatePassword("StrongPassword12!"));
});

test("five failed logins trigger a fifteen minute account cooldown", () => {
  const now = Date.parse("2026-06-13T08:00:00Z");
  const update = getFailedLoginUpdate(4, now);

  assert.equal(update.failedLoginAttempts, 0);
  assert.equal(
    update.lockedUntil.toISOString(),
    "2026-06-13T08:15:00.000Z"
  );
});

async function withCsrfServer(callback) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(createCorsMiddleware());
  app.get("/api/auth/csrf", (req, res) => {
    res.json({
      csrfToken: issueCsrfToken(getCsrfSessionBindingFromCookies(req.cookies)),
    });
  });
  app.use(createCsrfProtectionMiddleware());
  app.post("/api/mutate", (_req, res) => res.json({ ok: true }));
  app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("unsafe request without CSRF token is rejected", async () => {
  await withCsrfServer(async (origin) => {
    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 403);
    assert.match(await response.text(), /CSRF/i);
  });
});

test("unsafe request with CSRF token is allowed", async () => {
  await withCsrfServer(async (origin) => {
    const accessToken = "access-user-a";
    const csrfToken = issueCsrfToken(
      getCsrfSessionBindingFromCookies({ [ACCESS_COOKIE_NAME]: accessToken })
    );
    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: `${ACCESS_COOKIE_NAME}=${accessToken}`,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 200);
  });
});

test("CSRF from user A cannot be used by user B", async () => {
  await withCsrfServer(async (origin) => {
    const tokenUserA = issueCsrfToken(
      getCsrfSessionBindingFromCookies({ [ACCESS_COOKIE_NAME]: "access-user-a" })
    );

    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: `${ACCESS_COOKIE_NAME}=access-user-b`,
        "X-CSRF-Token": tokenUserA,
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 403);
    assert.match(await response.text(), /session/i);
  });
});

test("CSRF token issued when refresh and access cookies coexist still validates on access-cookie requests", async () => {
  await withCsrfServer(async (origin) => {
    const csrfToken = issueCsrfToken(
      getCsrfSessionBindingFromCookies({
        [ACCESS_COOKIE_NAME]: "access-user-a",
        [REFRESH_COOKIE_NAME]: "refresh-user-a",
      })
    );

    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: `${ACCESS_COOKIE_NAME}=access-user-a`,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 200);
  });
});

test("CSRF from old session fails after logout", async () => {
  await withCsrfServer(async (origin) => {
    const token = issueCsrfToken(
      getCsrfSessionBindingFromCookies({ [ACCESS_COOKIE_NAME]: "access-user-a" })
    );

    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 403);
  });
});

test("wrong CSRF token fails", async () => {
  await withCsrfServer(async (origin) => {
    const response = await fetch(`${origin}/api/mutate`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        Cookie: `${ACCESS_COOKIE_NAME}=access-user-a`,
        "X-CSRF-Token": "bad.token.value",
      },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 403);
  });
});

test("auth bootstrap routes remain CSRF-exempt", async () => {
  await withCsrfServer(async (origin) => {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });

    assert.equal(response.status, 200);
  });
});

test("security diagnostics stay restricted to Level 3 admins and report hardening flags", () => {
  const serverPath = path.join(__dirname, "..", "server.js");
  const source = fs.readFileSync(serverPath, "utf8");

  assert.match(
    source,
    /app\.get\(\s*"\/api\/security\/diagnostics",\s*requireRole\(USER_ROLES\.LEVEL_3_OWNER_ADMIN\)/s
  );
  assert.match(source, /cookieOnlyAuth:\s*true/);
  assert.match(source, /csrfEnabled:\s*true/);
  assert.match(source, /csrfSessionBound:\s*true/);
  assert.match(source, /encryptionFailClosed:/);
  assert.match(source, /cspMode:\s*base\.cspMode/);
  assert.match(source, /cspAllowsInlineStyles:\s*base\.cspAllowsInlineStyles/);
  assert.match(source, /cspAllowsInlineScripts:\s*base\.cspAllowsInlineScripts/);
  assert.match(source, /cspReportUri:\s*base\.cspReportUri/);
  assert.match(source, /localStorageAuthHintsDisabled:\s*true/);
  assert.match(source, /localStorageTokenDisabled:\s*true/);
  assert.match(source, /testRuntimeGuardEnabled:\s*true/);
  assert.match(source, /testRuntimeAllowed:\s*base\.testRuntimeAllowed/);
  assert.match(source, /hstsConfiguredByApp:\s*base\.hsts\.configuredByApp/);
  assert.match(source, /hstsMaxAge:\s*base\.hsts\.maxAge/);
  assert.match(source, /hstsIncludeSubDomains:\s*base\.hsts\.includeSubDomains/);
  assert.match(source, /hstsPreload:\s*base\.hsts\.preload/);
});
