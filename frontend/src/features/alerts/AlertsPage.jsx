import MetricCard from "../../components/common/MetricCard";

export default function AlertsPage({
  alertActionId,
  alertDigest,
  alertHealth,
  alertNeedsAction,
  alertRecent,
  alertResolved,
  alertRuleForm,
  alertRules,
  alertSummary,
  alertsData,
  formatPercent,
  handleAlertAction,
  handleCreateAlertRule,
  handleSaveTelegramChannel,
  handleSendTelegramTest,
  handleVerifyTelegramChannel,
  setAlertRuleForm,
  setTelegramForm,
  telegramChannel,
  telegramForm,
  telegramStatus,
  usefulAlerts,
}) {
  return (
<section className="alerts-panel alert-center-v3">
  <div className="alerts-panel-header">
    <div>
      <p className="eyebrow">Alerts Platform V3</p>
      <h2>{alertNeedsAction.length} need attention</h2>
      <p>Alert → Decision → Delivery → Audit → Learning</p>
    </div>
    {alertsData.generated_at && (
      <span>Last triggered {new Date(alertsData.generated_at).toLocaleString()}</span>
    )}
  </div>

  <div className="alert-stats-grid">
    <MetricCard label="Active" value={alertSummary.active ?? alertNeedsAction.length} />
    <MetricCard label="Critical" value={alertSummary.critical ?? 0} />
    <MetricCard label="Acknowledged" value={alertSummary.acknowledged ?? 0} />
    <MetricCard label="Snoozed" value={alertSummary.snoozed ?? 0} />
    <MetricCard label="Resolved" value={alertSummary.resolved ?? 0} />
    <MetricCard label="Deduped" value={alertHealth.deduped ?? 0} />
  </div>

  {alertsData.error && <p className="engine-error">{alertsData.error}</p>}

  <div className="alert-center-grid">
    <section className="alerts-panel nested-panel telegram-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Telegram Delivery</p>
          <h3>{telegramChannel?.verified ? "Connected" : "Connect Telegram"}</h3>
        </div>
        <span className={`status-pill ${telegramChannel?.verified ? "low" : "medium"}`}>
          {telegramChannel?.verified ? "Verified" : "Not verified"}
        </span>
      </div>
      <div className="settings-grid compact">
        <label>
          <span>Bot token</span>
          <input
            onChange={(event) =>
              setTelegramForm({ ...telegramForm, telegramBotToken: event.target.value })
            }
            placeholder={telegramChannel?.hasTelegramBotToken ? "Token saved" : "123456:ABC..."}
            type="password"
            value={telegramForm.telegramBotToken}
          />
        </label>
        <label>
          <span>Mode</span>
          <select
            onChange={(event) =>
              setTelegramForm({ ...telegramForm, digestMode: event.target.value })
            }
            value={telegramForm.digestMode}
          >
            <option value="immediate">Immediate</option>
            <option value="15m">15 min digest</option>
            <option value="1h">1 hour digest</option>
            <option value="daily">Daily summary</option>
          </select>
        </label>
      </div>
      {telegramChannel?.verificationCode && (
        <p className="alerts-empty">
          Send <strong>/connect {telegramChannel.verificationCode}</strong> to your bot.
        </p>
      )}
      {telegramStatus && <p className="alerts-empty">{telegramStatus}</p>}
      <div className="approval-actions">
        <button onClick={handleSaveTelegramChannel} type="button">
          Save Channel
        </button>
        <button onClick={handleVerifyTelegramChannel} type="button">
          Verify
        </button>
        <button
          className="success"
          disabled={!telegramChannel?.verified}
          onClick={handleSendTelegramTest}
          type="button"
        >
          Send Test Alert
        </button>
      </div>
    </section>

    <section className="alerts-panel nested-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Rule Builder</p>
          <h3>{alertRules.length} rules</h3>
        </div>
      </div>
      <div className="settings-grid compact">
        <label>
          <span>Name</span>
          <input
            onChange={(event) =>
              setAlertRuleForm({ ...alertRuleForm, name: event.target.value })
            }
            value={alertRuleForm.name}
          />
        </label>
        <label>
          <span>Confidence &gt;</span>
          <input
            onChange={(event) =>
              setAlertRuleForm({ ...alertRuleForm, minConfidence: event.target.value })
            }
            type="number"
            value={alertRuleForm.minConfidence}
          />
        </label>
        <label>
          <span>Score &gt;</span>
          <input
            onChange={(event) =>
              setAlertRuleForm({ ...alertRuleForm, minScore: event.target.value })
            }
            type="number"
            value={alertRuleForm.minScore}
          />
        </label>
        <label>
          <span>Market</span>
          <select
            onChange={(event) =>
              setAlertRuleForm({ ...alertRuleForm, market: event.target.value })
            }
            value={alertRuleForm.market}
          >
            <option>ALL</option>
            <option>US</option>
            <option>SG</option>
          </select>
        </label>
      </div>
      <button className="direction-toggle" onClick={handleCreateAlertRule} type="button">
        Create Rule
      </button>
      {alertRules.length > 0 && (
        <div className="tag-row">
          {alertRules.slice(0, 6).map((rule) => (
            <span className="market-badge" key={rule.id}>
              {rule.name}
            </span>
          ))}
        </div>
      )}
    </section>
  </div>

  {alertDigest.length > 0 && (
    <section className="alerts-panel nested-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Digest</p>
          <h3>{alertDigest[0].title}</h3>
        </div>
        <span>{alertDigest[0].count} related alerts</span>
      </div>
      <p>{alertDigest[0].message}</p>
      <div className="tag-row">
        {(alertDigest[0].symbols || []).map((symbol) => (
          <span className="market-badge" key={symbol}>{symbol}</span>
        ))}
      </div>
    </section>
  )}

  {[
    ["Critical", alertNeedsAction.filter((alert) => alert.severity === "CRITICAL")],
    ["Needs Action", alertNeedsAction.filter((alert) => alert.severity !== "CRITICAL")],
    ["Recent", alertRecent],
    ["Resolved", alertResolved],
  ].map(([sectionTitle, alerts]) => (
    <section className="alerts-panel nested-panel" key={sectionTitle}>
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">{sectionTitle}</p>
          <h3>{alerts.length} alerts</h3>
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="alerts-list">
          {alerts.slice(0, sectionTitle === "Needs Action" ? 20 : 12).map((alert) => (
            <details className={`alert-card severity-${String(alert.severity || "medium").toLowerCase()}`} key={alert.id}>
              <summary>
                <div>
                  <strong>{alert.symbol || alert.category}</strong>
                  <span>{alert.title || alert.message}</span>
                </div>
                <div className="alert-summary-meta">
                  <span className={`status-pill ${String(alert.severity || "medium").toLowerCase()}`}>
                    {alert.severity}
                  </span>
                  <span>{alert.occurrences > 1 ? `x${alert.occurrences}` : alert.status}</span>
                </div>
              </summary>
              <p>{alert.message}</p>
              <dl>
                <div><dt>Category</dt><dd>{alert.category}</dd></div>
                <div><dt>Score</dt><dd>{alert.score ?? "-"}</dd></div>
                <div><dt>Confidence</dt><dd>{alert.confidence ?? "-"}</dd></div>
                <div><dt>Backtest</dt><dd>{formatPercent(alert.backtest_return)}</dd></div>
                <div><dt>Drawdown</dt><dd>{formatPercent(alert.drawdown)}</dd></div>
                <div>
                  <dt>Last Triggered</dt>
                  <dd>
                    {alert.last_triggered_at
                      ? new Date(alert.last_triggered_at).toLocaleString()
                      : "-"}
                  </dd>
                </div>
              </dl>
              {Array.isArray(alert.reasons) && alert.reasons.length > 0 && (
                <ul className="reason-list">
                  {alert.reasons.slice(0, 5).map((reason, index) => (
                    <li key={`${alert.id}-reason-${index}`}>{reason}</li>
                  ))}
                </ul>
              )}
              {Array.isArray(alert.metadata?.timeline) && alert.metadata.timeline.length > 0 && (
                <div className="audit-timeline">
                  {alert.metadata.timeline.slice(-4).map((event, index) => (
                    <span key={`${alert.id}-timeline-${index}`}>
                      {event.action} · {event.actedAt ? new Date(event.actedAt).toLocaleString() : "-"}
                    </span>
                  ))}
                </div>
              )}
              <div className="approval-actions">
                <button
                  className="success"
                  disabled={alertActionId === alert.id || alert.status === "RESOLVED"}
                  onClick={() => handleAlertAction(alert.id, "resolve", { reason: "Resolved from Alerts Center" })}
                  type="button"
                >
                  Resolve
                </button>
                <button
                  disabled={alertActionId === alert.id || alert.status === "SNOOZED"}
                  onClick={() => handleAlertAction(alert.id, "snooze", { reason: "Snoozed from Alerts Center" })}
                  type="button"
                >
                  Snooze
                </button>
                <button
                  disabled={alertActionId === alert.id || alert.status === "ACKNOWLEDGED"}
                  onClick={() => handleAlertAction(alert.id, "acknowledge", { reason: "Acknowledged from Alerts Center" })}
                  type="button"
                >
                  Acknowledge
                </button>
                <button
                  className="danger"
                  disabled={alertActionId === alert.id || alert.status === "RESOLVED"}
                  onClick={() => handleAlertAction(alert.id, "dismiss", { reason: "Dismissed from Alerts Center" })}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="alerts-empty">
          {sectionTitle === "Needs Action" || sectionTitle === "Critical"
            ? "No alerts need attention right now."
            : `No ${sectionTitle.toLowerCase()} alerts.`}
        </p>
      )}
    </section>
  ))}

  <section className="alerts-panel nested-panel">
    <div className="alerts-panel-header">
      <div>
        <p className="eyebrow">Alert Intelligence</p>
        <h3>Usefulness and response</h3>
      </div>
    </div>
    <div className="alert-stats-grid">
      <MetricCard label="Created" value={alertHealth.created ?? 0} />
      <MetricCard label="Resolved" value={alertHealth.resolved ?? 0} />
      <MetricCard label="Avg response" value={alertHealth.avg_lifetime_minutes == null ? "-" : `${alertHealth.avg_lifetime_minutes}m`} />
      <MetricCard label="Resolution %" value={`${Math.round((alertHealth.resolution_rate || 0) * 100)}%`} />
    </div>
    {usefulAlerts.length > 0 ? (
      <div className="tag-row">
        {usefulAlerts.map((alert) => (
          <span className="market-badge" key={`useful-${alert.id}`}>
            {alert.symbol || alert.category} · x{alert.occurrences || 1}
          </span>
        ))}
      </div>
    ) : (
      <p className="alerts-empty">Resolve or acknowledge alerts to build usefulness history.</p>
    )}
  </section>
</section>
  );
}
