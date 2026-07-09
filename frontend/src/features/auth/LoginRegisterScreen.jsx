import { useState } from "react";

function BrandMark() {
  return (
    <svg aria-hidden="true" className="auth-brand-mark" viewBox="0 0 24 24">
      <rect x="0.6" y="0.6" width="22.8" height="22.8" rx="6.5" />
      <rect x="6" y="11" width="2.4" height="7" rx="1.2" />
      <rect x="10.8" y="6" width="2.4" height="12" rx="1.2" />
      <rect x="15.6" y="8.5" width="2.4" height="9.5" rx="1.2" />
    </svg>
  );
}

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.5 5.2A9.6 9.6 0 0 1 12 5c5 0 8.6 4.4 9.7 6-.5.8-1.7 2.3-3.4 3.6" />
        <path d="M6.6 6.7C4.5 8 3.1 10 2.3 11c1.1 1.6 4.7 6 9.7 6 1.6 0 3-.4 4.2-1" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2.3 12s3.7-6 9.7-6 9.7 6 9.7 6-3.7 6-9.7 6-9.7-6-9.7-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LoginRegisterScreen({
  onBack,
  error,
  form,
  isLoading,
  mode,
  onChange,
  onModeChange,
  onSubmit,
  onThemeToggle,
  theme,
}) {
  const isRegister = mode === "register";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-shell">
      <section className="login-terminal">
        <header className="login-topbar">
          <div className="login-topbar-left">
            <div aria-hidden="true" className="login-window-dots">
              <span />
              <span />
              <span />
            </div>
            <div className="login-brand">
              <BrandMark />
              <strong>Quant&apos;s Trade</strong>
            </div>
            <span className="login-session-tag">Controlled access · Backend enforced</span>
          </div>
          <div className="login-card-actions">
            <span className="login-utc">UTC {new Date().toLocaleTimeString("en-GB", { hour12: false })}</span>
            <button className="theme-toggle" onClick={onThemeToggle} type="button">
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button className="theme-toggle" onClick={onBack} type="button">
              Back
            </button>
          </div>
        </header>

        <div className="login-body">
          <section className="login-main">
            <div>
              <p className="eyebrow">Trading Cockpit</p>
              <h1>{isRegister ? "Request access" : "Sign in"}</h1>
              <p className="subtitle">
                {isRegister
                  ? "Create your account for review. Cockpit access, admin controls, and execution surfaces stay locked until a Level 3 owner admin verifies your account."
                  : "Enter a controlled trading workspace where access is verified, permissions are enforced in the backend, and sensitive broker or notification secrets stay encrypted server-side."}
              </p>
            </div>

            <div className={`login-mode-toggle ${isRegister ? "register-active" : ""}`}>
              <span className="login-mode-indicator" />
              <button
                className={!isRegister ? "active" : ""}
                onClick={() => onModeChange("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={isRegister ? "active" : ""}
                onClick={() => onModeChange("register")}
                type="button"
              >
                Register
              </button>
            </div>

            <form className="login-form" onSubmit={onSubmit}>
              {isRegister && (
                <label>
                  Name
                  <input
                    autoComplete="name"
                    onChange={(event) => onChange("name", event.target.value)}
                    placeholder="Your name"
                    required
                    value={form.name}
                  />
                </label>
              )}
              <label>
                Email
                <input
                  autoComplete="email"
                  onChange={(event) => onChange("email", event.target.value)}
                  placeholder="you@desk.com"
                  required
                  type="email"
                  value={form.email}
                />
              </label>
              <label>
                <span>
                  Password
                  {!isRegister ? <em>Forgot?</em> : null}
                </span>
                <span className="password-input-shell">
                  <input
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    minLength={isRegister ? 8 : undefined}
                    onChange={(event) => onChange("password", event.target.value)}
                    placeholder="••••••••••••"
                    required
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="password-visibility-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </span>
              </label>
              {error && <p className="engine-error">{error}</p>}
              <button className="login-submit" disabled={isLoading} type="submit">
                {isLoading
                  ? isRegister
                    ? "Creating..."
                    : "Signing in..."
                  : isRegister
                    ? "Request access"
                    : "Sign in"}
              </button>
            </form>

            <p className="login-note">
              Sessions use rotating HttpOnly cookies, CSRF checks guard mutations, passwords are hashed, and stored broker or notification secrets are encrypted at rest with server-side key management.
            </p>
          </section>

          <aside className="login-sidepanel">
            <span className="login-corner login-corner-tl" />
            <span className="login-corner login-corner-tr" />
            <span className="login-corner login-corner-bl" />
            <span className="login-corner login-corner-br" />

            <div className="login-sideblock">
              <p>Security posture</p>
              <strong><i /> Verified access required</strong>
              <span>backend-enforced permissions · CSRF-checked writes</span>
            </div>

            <div className="login-sideblock">
              <p>Execution controls</p>
              <div className="login-side-list">
                <span>Approvals <b>REQUIRED</b></span>
                <span>Paper execution <b>DEFAULT</b></span>
                <span>Live broker path <b>LOCKED</b></span>
              </div>
            </div>

            <div className="login-sideblock">
              <p>Data handling</p>
              <strong>Secrets encrypted at rest</strong>
              <span>audit trail enabled · admin and allocation actions recorded</span>
            </div>

            <div className="login-sideblock">
              <p>Build</p>
              <strong>2026.06 · main</strong>
            </div>
          </aside>
        </div>

        <footer className="login-footer">
          <span>Verified access</span>
          <span>Backend enforced</span>
          <span>Secrets encrypted at rest</span>
          <span>Quant&apos;s Trade v2026.06 · main</span>
        </footer>
      </section>
    </main>
  );
}
