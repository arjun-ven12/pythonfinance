const IBKR_SETUP_STEPS = [
  "Open Trader Workstation or IB Gateway",
  "Log into Paper Trading first",
  "Enable API socket clients",
  "Paper port usually 7497",
  "Live port usually 7496",
  "Keep localhost only enabled",
  "Read-only API is recommended until execution is enabled",
];

export default function BrokersTab({
  config,
  error,
  isSaving,
  isTesting,
  onChange,
  onSave,
  onTest,
  status,
}) {
  const currentStatus = status?.status || "NOT_CONFIGURED";
  const connectionTest = status?.connection_test || {};

  return (
    <section className="ibkr-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Broker Connection</p>
          <h2>Broker Connection Test</h2>
        </div>
        <span className={`ibkr-status ${currentStatus.toLowerCase()}`}>
          {currentStatus}
        </span>
      </div>

      {error && <p className="engine-error">{error}</p>}

      <div className="ibkr-grid">
        <article className="ibkr-card">
          <div>
            <p className="eyebrow">Connection config</p>
            <h3>Trader Workstation / Gateway</h3>
          </div>
          <div className="ibkr-form-grid">
            <label>
              <span>Host</span>
              <input
                onChange={(event) => onChange("host", event.target.value)}
                value={config.host}
              />
            </label>
            <label>
              <span>Port</span>
              <input
                min="1"
                max="65535"
                onChange={(event) => onChange("port", event.target.value)}
                type="number"
                value={config.port}
              />
            </label>
            <label>
              <span>Client ID</span>
              <input
                min="0"
                onChange={(event) => onChange("clientId", event.target.value)}
                type="number"
                value={config.clientId}
              />
            </label>
            <label>
              <span>Mode</span>
              <select
                onChange={(event) => onChange("mode", event.target.value)}
                value={config.mode}
              >
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </label>
          </div>
          <div className="ibkr-actions">
            <button disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? "Saving..." : "Save Config"}
            </button>
            <button disabled={isTesting} onClick={onTest} type="button">
              {isTesting ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </article>

        <article className="ibkr-card">
          <div>
            <p className="eyebrow">Status</p>
            <h3>{currentStatus}</h3>
          </div>
          <dl className="ibkr-status-grid">
            <div>
              <dt>Host</dt>
              <dd>{status?.host || config.host}</dd>
            </div>
            <div>
              <dt>Port</dt>
              <dd>{status?.port || config.port}</dd>
            </div>
            <div>
              <dt>Client ID</dt>
              <dd>{status?.clientId ?? config.clientId}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{status?.mode || config.mode}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>
                {status?.last_checked_at
                  ? new Date(status.last_checked_at).toLocaleString()
                  : "Never"}
              </dd>
            </div>
            <div>
              <dt>Server time</dt>
              <dd>{status?.server_time || "-"}</dd>
            </div>
            <div>
              <dt>Account summary</dt>
              <dd>{status?.account_summary_available ? "Available" : "Not requested"}</dd>
            </div>
            <div>
              <dt>Python package</dt>
              <dd>
                {connectionTest.dependency_available === true
                  ? "ib_insync installed"
                  : connectionTest.dependency_available === false
                    ? "ib_insync missing"
                    : "-"}
              </dd>
            </div>
            <div>
              <dt>Socket</dt>
              <dd>
                {connectionTest.socket_reachable === true
                  ? "Reachable"
                  : connectionTest.socket_reachable === false
                    ? "Not reachable"
                    : "-"}
              </dd>
            </div>
            <div>
              <dt>Error</dt>
              <dd>{status?.error || "-"}</dd>
            </div>
          </dl>
          {connectionTest.setup_hint && (
            <p className="ibkr-note">{connectionTest.setup_hint}</p>
          )}
        </article>
      </div>

      <article className="ibkr-card">
        <div>
          <p className="eyebrow">Setup Instructions</p>
          <h3>Connection checklist</h3>
        </div>
        <ul className="ibkr-instructions">
          {IBKR_SETUP_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <p className="ibkr-note">
          This panel only tests connectivity. It does not place orders, modify paper
          execution, or connect approval workflow to the broker.
        </p>
      </article>
    </section>
  );
}
