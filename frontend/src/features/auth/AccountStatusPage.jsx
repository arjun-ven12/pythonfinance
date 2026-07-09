import "./auth.css";

const STATUS_CONTENT = {
  PENDING_VERIFICATION: {
    title: "Awaiting verification",
    message: "Your account has been created, but cockpit access stays locked until a Level 3 owner admin approves it.",
    badge: "Pending approval",
    accent: "pending",
  },
  REJECTED: {
    title: "Access rejected",
    message: "This account was rejected. Contact the owner admin if you think this should be reviewed again.",
    badge: "Rejected",
    accent: "rejected",
  },
  SUSPENDED: {
    title: "Account suspended",
    message: "This account is suspended. Reach out to the owner admin for the next step.",
    badge: "Suspended",
    accent: "suspended",
  },
};

function StatusMark() {
  return (
    <svg aria-hidden="true" className="status-brand-mark" viewBox="0 0 60 60">
      <rect x="1.3" y="1.3" width="57.4" height="57.4" rx="15" />
      <rect className="status-brand-bar status-brand-bar-1" x="15" y="28" width="5" height="17" rx="2.5" />
      <rect className="status-brand-bar status-brand-bar-2" x="27" y="16" width="5" height="29" rx="2.5" />
      <rect className="status-brand-bar status-brand-bar-3" x="39" y="22" width="5" height="23" rx="2.5" />
    </svg>
  );
}

export default function AccountStatusPage({ onLogout, onViewDemo, status, user }) {
  const content = STATUS_CONTENT[status] || STATUS_CONTENT.PENDING_VERIFICATION;

  return (
    <main className="status-shell">
      <section className={`status-panel status-panel--${content.accent}`}>
        <div className="status-panel__hero">
          <div className="status-panel__brand">
            <StatusMark />
            <div>
              <span className="status-panel__eyebrow">Trading cockpit</span>
              <h1>{content.title}</h1>
            </div>
          </div>
          <span className={`status-chip status-chip--${content.accent}`}>{content.badge}</span>
        </div>

        <div className="status-panel__body">
          <div className="status-panel__copy">
            <p>{content.message}</p>
            {user?.rejectedReason ? (
              <div className="status-note">
                <strong>Admin note</strong>
                <span>{user.rejectedReason}</span>
              </div>
            ) : null}
          </div>

          <div className="status-panel__side">
            <div className="status-card">
              <span className="status-card__label">Account</span>
              <strong>{user?.email || "Pending user"}</strong>
            </div>
            <div className="status-card">
              <span className="status-card__label">Access state</span>
              <strong>{content.badge}</strong>
            </div>
            <div className="status-card">
              <span className="status-card__label">Next step</span>
              <strong>Owner admin review</strong>
            </div>
          </div>
        </div>

        <div className="status-panel__footer">
          <span>Access control is enforced server-side.</span>
          <div className="status-panel__actions">
            {status === "PENDING_VERIFICATION" ? (
              <button className="status-panel__secondary-action" onClick={onViewDemo} type="button">
                View Guided Demo
              </button>
            ) : null}
            <button className="status-panel__action" onClick={() => onLogout("")} type="button">
              Sign out
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
