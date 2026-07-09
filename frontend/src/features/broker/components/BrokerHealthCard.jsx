function statusClass(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function formatHealthValue(item) {
  if (item.render) return item.render(item.value);
  if (typeof item.value === "boolean") return item.value ? "Yes" : "No";
  return item.value == null || item.value === "" ? "-" : item.value;
}

function formatConnectionMode(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function renderField(field, value, onChange, disabled) {
  if (field.type === "select") {
    return (
      <select
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(field.key, event.target.value)}
      >
        {(field.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      disabled={disabled}
      max={field.max}
      min={field.min}
      placeholder={field.placeholder}
      type={field.type || "text"}
      value={value ?? ""}
      onChange={(event) => onChange(field.key, event.target.value)}
    />
  );
}

export default function BrokerHealthCard({
  brokerMeta,
  config,
  configFields = [],
  secretFields = [],
  secretInputs = {},
  secretStatus = null,
  configMeta = null,
  accountOptions = [],
  selectedAccountId = "",
  error,
  health,
  healthItems = [],
  isConfiguredProvider,
  isSaving,
  isTesting,
  isRefreshingAccounts = false,
  onChange,
  onSecretChange,
  onAccountSelect,
  onSave,
  onTest,
  onRefreshAccounts,
  onSelectAccount,
  saveLabel = "Save",
  testLabel = "Test Connection",
}) {
  const status = health?.healthStatus || health?.status || "Disconnected";
  const hasConfigFields = configFields.length > 0;
  const hasSecretFields = secretFields.length > 0;
  const effectiveTradeEnv =
    configMeta?.effectiveConfig?.tradeEnv ||
    configMeta?.effectiveConfig?.defaultTrdEnv ||
    config?.tradeEnv ||
    config?.defaultTrdEnv ||
    "SIMULATE";
  const actualConnectionMode =
    health?.protocolUsed ||
    configMeta?.effectiveConfig?.transport ||
    config?.transport ||
    "python_bridge";
  const configuredTransport =
    configMeta?.config?.transport || config?.transport || null;
  const showConfiguredTransportNote =
    configuredTransport &&
    String(configuredTransport).toLowerCase() !== String(actualConnectionMode).toLowerCase();

  return (
    <article className="ibkr-card broker-health-card">
      <div className="broker-card-header">
        <div>
          <p className="eyebrow">Broker Health</p>
          <h3>{brokerMeta.label}</h3>
        </div>
        <span className={`ibkr-status ${statusClass(status)}`}>{status}</span>
      </div>

      <p className="ibkr-note">
        {hasConfigFields
          ? brokerMeta.subtitle
          : "No broker configuration is required for this connection path."}
      </p>

      {health?.providerWarning ? (
        <p className="ibkr-note broker-health-warning">{health.providerWarning}</p>
      ) : null}

      {configMeta?.effectiveTarget ? (
        <div className="broker-effective-target">
          <span>Effective connection target</span>
          <strong>{configMeta.effectiveTarget}</strong>
          <small>
            {formatConnectionMode(actualConnectionMode)}
            {" · "}
            {effectiveTradeEnv}
          </small>
          {showConfiguredTransportNote ? (
            <small>
              Configured transport: {formatConnectionMode(configuredTransport)}
            </small>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="engine-error">{error}</p> : null}

      {hasConfigFields ? (
        <div className="ibkr-form-grid broker-config-grid">
          {configFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              {renderField(field, config?.[field.key], onChange, !isConfiguredProvider && brokerMeta.label === "IBKR")}
            </label>
          ))}
        </div>
      ) : (
        <div className="broker-empty-config">
          <strong>{brokerMeta.label} requires no manual host or credential setup.</strong>
          <span>The platform can use this connection path immediately.</span>
        </div>
      )}

      <div className="broker-security-note">
        <strong>Secrets are encrypted server-side and never stored in this browser.</strong>
        {secretStatus ? (
          <span>
            Secret status: {secretStatus.configured ? "Configured" : "Not configured"}
            {secretStatus.lastUpdatedAt
              ? ` · Updated ${new Date(secretStatus.lastUpdatedAt).toLocaleString()}`
              : ""}
          </span>
        ) : null}
      </div>

      {hasSecretFields ? (
        <div className="ibkr-form-grid broker-config-grid broker-secret-grid">
          {secretFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              {renderField(
                field,
                secretInputs?.[field.key] ?? "",
                onSecretChange,
                !isConfiguredProvider && brokerMeta.label === "IBKR"
              )}
            </label>
          ))}
        </div>
      ) : null}

      {hasConfigFields ? (
        <div className="ibkr-actions">
          <button disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : saveLabel}
          </button>
          <button disabled={isTesting} onClick={onTest} type="button">
            {isTesting ? "Testing..." : testLabel}
          </button>
          {brokerMeta.label === "Moomoo" ? (
            <button disabled={isRefreshingAccounts} onClick={onRefreshAccounts} type="button">
              {isRefreshingAccounts ? "Refreshing..." : "Refresh Accounts"}
            </button>
          ) : null}
        </div>
      ) : null}

      {brokerMeta.label === "Moomoo" ? (
        <div className="broker-account-picker">
          <label>
            <span>Account Selection</span>
            <select
              value={selectedAccountId ?? ""}
              onChange={(event) => onAccountSelect?.(event.target.value)}
            >
              <option value="">No account selected</option>
              {accountOptions.map((account) => (
                <option
                  key={account.selectionKey || `${account.tradeEnv || "SIMULATE"}:${account.accountId}`}
                  value={account.selectionKey || `${account.tradeEnv || "SIMULATE"}:${account.accountId}`}
                >
                  {account.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!selectedAccountId || isSaving}
            onClick={onSelectAccount}
            type="button"
          >
            Select Account
          </button>
        </div>
      ) : null}

      <dl className="ibkr-status-grid broker-health-grid">
        {healthItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{formatHealthValue(item)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
