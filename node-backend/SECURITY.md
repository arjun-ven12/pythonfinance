# Web Security Configuration

The backend uses credentialed, origin-restricted CORS, HttpOnly authentication
cookies, Helmet, rate limits, request IDs, and no-store API responses.

## Environment

- `CORS_ALLOWED_ORIGINS`: comma-separated browser origins allowed to call the API.
- `FRONTEND_URL`: production frontend origin fallback.
- `BACKEND_URL`: backend origin included in CSP.
- `APP_ENCRYPTION_KEY_CURRENT`: required in every environment except `test`.
- `APP_ENCRYPTION_KEY_PREVIOUS`: optional previous key kept during rotations.
- `CSP_REPORT_ONLY`: production enforces CSP by default. Set to `true` only
  when you intentionally need report-only rollout verification.
- `HSTS_ENABLED`: defaults to enabled in production and disabled in development.
- `HSTS_MAX_AGE`: defaults to `15552000` seconds when app HSTS is enabled.
- `HSTS_INCLUDE_SUBDOMAINS`: defaults to `false`; enable only when deployment is ready.
- `HSTS_PRELOAD`: defaults to `false`; enable only if intentionally submitting to preload lists.
- `TRUST_PROXY`: set to `true` only behind one trusted reverse proxy.
- `ALLOW_TEST_ENV_RUNTIME`: keep `false` for normal startup. Set to `true` only
  for explicit local test-runtime execution outside automated test harnesses.

Production authentication cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
Local development omits `Secure` because browsers do not send Secure cookies over
plain `http://localhost`.

## Compatibility Exceptions

- `crossOriginEmbedderPolicy` is disabled because the current development setup
  and chart rendering use cross-origin resources.
- CSP temporarily allows inline styles because React style attributes and the
  chart libraries depend on them. Inline scripts and `unsafe-eval` are not allowed.
- Vite development adds `script-src 'unsafe-inline'` because React Refresh
  injects an inline bootstrap. Production keeps inline scripts disabled.
- Production CSP enforces by default. Reports are still accepted at
  `POST /api/security/csp-report` and logged without authentication. Development
  keeps CSP in report-only mode for local compatibility.

Use `GET /api/security/diagnostics` while authenticated to inspect the active
security mode without exposing secrets.

The Vite development and preview servers emit the same report-only browser
policy. A production static host or reverse proxy must copy those response
headers when serving `frontend/dist`; API response headers alone cannot protect
the React document.
