import "./auth.css";

export default function AccessDeniedPage({ onGoSettings, pageName = "this page" }) {
  return (
    <section className="auth-shell auth-shell-inline">
      <div className="auth-panel">
        <div className="auth-brand-block">
          <span className="auth-brand-kicker">Access control</span>
          <h1>Access denied</h1>
          <p>You do not currently have permission to open {pageName}.</p>
        </div>
        <div className="auth-actions">
          <button className="auth-submit" onClick={onGoSettings} type="button">
            Back to Settings
          </button>
        </div>
      </div>
    </section>
  );
}
