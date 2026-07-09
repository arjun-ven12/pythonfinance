import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch as fetch } from "../../services/apiClient";

const SECTIONS = ["Overview", "Versions", "Performance", "Insights", "Audit & Export"];
const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

function formatMetric(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : null;
}

function Metric({ label, value }) {
  if (value == null) return null;
  return (
    <article className="playbook-v2-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function VersionLabel({ version }) {
  return (
    <>
      Version {version.versionNumber}
      {version.isActive ? " (active)" : ""}
    </>
  );
}

export default function PlaybookTab({
  apiBaseUrl,
  data,
  error,
  exportError,
  isGeneratingAi,
  onExport,
  onGenerateAi,
  onRefresh,
}) {
  const [section, setSection] = useState("Overview");
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");
  const [comparison, setComparison] = useState(null);
  const playbook = data?.playbook || EMPTY_OBJECT;
  const activeVersion = data?.active_version;
  const versions = data?.versions || EMPTY_ARRAY;
  const performance = data?.performance || EMPTY_OBJECT;
  const evidence = data?.evidence || EMPTY_OBJECT;
  const insights = data?.insights || EMPTY_ARRAY;
  const recommendations = data?.recommendations || EMPTY_ARRAY;
  const runs = data?.recent_runs || EMPTY_ARRAY;
  const auditTrail = data?.audit_trail || EMPTY_ARRAY;
  const selectedCompareLeft = compareLeft || versions[0]?.id || "";
  const selectedCompareRight = compareRight || versions[1]?.id || "";

  const metrics = useMemo(
    () =>
      [
        ["Return", formatMetric(performance.total_return, "%")],
        ["CAGR", formatMetric(performance.cagr, "%")],
        ["Sharpe", formatMetric(performance.sharpe)],
        ["Sortino", formatMetric(performance.sortino)],
        ["Drawdown", formatMetric(performance.drawdown, "%")],
        ["Expectancy", formatMetric(performance.expectancy)],
        ["Profit Factor", formatMetric(performance.profit_factor)],
        ["Alpha", formatMetric(performance.alpha, "%")],
        [
          "Trades",
          Number.isFinite(Number(performance.trades))
            ? String(performance.trades)
            : null,
        ],
      ].filter(([, value]) => value != null),
    [performance]
  );

  const callAction = async (key, endpoint, options = {}) => {
    setBusyAction(key);
    setActionError("");
    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: options.method || "POST",
        headers: { "Content-Type": "application/json" },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Playbook action failed.");
      }
      await onRefresh();
      return result;
    } catch (nextError) {
      setActionError(nextError.message);
      return null;
    } finally {
      setBusyAction("");
    }
  };

  const compareVersions = async () => {
    if (
      !selectedCompareLeft ||
      !selectedCompareRight ||
      selectedCompareLeft === selectedCompareRight
    ) {
      setActionError("Choose two different versions to compare.");
      return;
    }
    setBusyAction("compare");
    setActionError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/playbooks/${encodeURIComponent(playbook.id)}/versions/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leftVersionId: selectedCompareLeft,
            rightVersionId: selectedCompareRight,
          }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to compare versions.");
      setComparison(result);
    } catch (nextError) {
      setActionError(nextError.message);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className="playbook-v2">
      <header className="playbook-v2-header">
        <div>
          <p className="eyebrow">Versioned Research System</p>
          <h2>{playbook.name || "Trading Playbook"}</h2>
          <p>
            {playbook.description ||
              "Immutable strategy evidence, versions, decisions, and review history."}
          </p>
        </div>
        <div className="playbook-v2-header-actions">
          <button
            disabled={Boolean(busyAction)}
            onClick={() =>
              callAction("record", "/api/playbook/sync", {
                body: { playbookId: playbook.id },
              })
            }
            type="button"
          >
            {busyAction === "record" ? "Recording..." : "Record Evidence Run"}
          </button>
          <button
            disabled={Boolean(busyAction)}
            onClick={() =>
              callAction("version", "/api/playbook/snapshots", {
                body: { playbookId: playbook.id },
              })
            }
            type="button"
          >
            {busyAction === "version" ? "Saving..." : "Save Draft Version"}
          </button>
        </div>
      </header>

      <nav className="playbook-v2-nav" aria-label="Playbook sections">
        {SECTIONS.map((item) => (
          <button
            className={section === item ? "active" : ""}
            key={item}
            onClick={() => setSection(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>

      {(error || exportError || actionError) && (
        <div className="playbook-v2-error" role="alert">
          {actionError || error || exportError}
        </div>
      )}

      {section === "Overview" && (
        <>
          <section className="playbook-v2-overview">
            <article className="playbook-v2-active">
              <div>
                <p className="eyebrow">Active Version</p>
                <h3>
                  {activeVersion
                    ? `Version ${activeVersion.versionNumber}`
                    : "No active version"}
                </h3>
              </div>
              {activeVersion && <span className="status-badge active">Active</span>}
              <dl>
                <div>
                  <dt>Horizon</dt>
                  <dd>{activeVersion?.horizon}</dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>{activeVersion?.executionMode}</dd>
                </div>
                <div>
                  <dt>Benchmark</dt>
                  <dd>{activeVersion?.benchmark}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {activeVersion?.createdAt
                      ? new Date(activeVersion.createdAt).toLocaleString()
                      : null}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="playbook-v2-evidence">
              <div className="playbook-v2-score">
                <span>Evidence Score</span>
                <strong>{evidence.score ?? 0}</strong>
                <small>/ 100</small>
              </div>
              <div>
                <p className="eyebrow">Deployment Readiness</p>
                <h3>{evidence.eligible ? "Evidence Ready" : "Building Evidence"}</h3>
                <p>
                  {evidence.eligible
                    ? "Minimum run, trade, and time coverage has been reached."
                    : "Deterministic insights stay locked until evidence thresholds are met."}
                </p>
              </div>
            </article>
          </section>

          {!evidence.eligible && evidence.warnings?.length > 0 && (
            <section className="playbook-v2-warning">
              <p className="eyebrow">Evidence Warnings</p>
              <ul>
                {evidence.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          {metrics.length > 0 && (
            <section className="playbook-v2-metrics">
              {metrics.slice(0, 6).map(([label, value]) => (
                <Metric key={label} label={label} value={value} />
              ))}
            </section>
          )}

          {activeVersion && (
            <section className="playbook-v2-snapshots">
              <article>
                <p className="eyebrow">Strategy Settings</p>
                <pre>{JSON.stringify(activeVersion.settingsSnapshot, null, 2)}</pre>
              </article>
              <article>
                <p className="eyebrow">Risk & Universe</p>
                <pre>
                  {JSON.stringify(
                    {
                      risk: activeVersion.riskSnapshot,
                      universe: activeVersion.universeSnapshot,
                    },
                    null,
                    2
                  )}
                </pre>
              </article>
            </section>
          )}
        </>
      )}

      {section === "Versions" && (
        <>
          <section className="playbook-v2-compare">
            <label>
              <span>Version A</span>
              <select
                onChange={(event) => setCompareLeft(event.target.value)}
                value={selectedCompareLeft}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Version B</span>
              <select
                onChange={(event) => setCompareRight(event.target.value)}
                value={selectedCompareRight}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busyAction === "compare"} onClick={compareVersions} type="button">
              {busyAction === "compare" ? "Comparing..." : "Compare Diff"}
            </button>
          </section>

          {comparison?.differences?.length > 0 && (
            <section className="playbook-v2-diff">
              <div className="playbook-v2-table-row heading">
                <span>Field</span>
                <span>Version A</span>
                <span>Version B</span>
              </div>
              {comparison.differences.map((difference) => (
                <div className="playbook-v2-table-row" key={difference.path}>
                  <strong>{difference.path}</strong>
                  <code>{JSON.stringify(difference.before)}</code>
                  <code>{JSON.stringify(difference.after)}</code>
                </div>
              ))}
            </section>
          )}

          <section className="playbook-v2-version-list">
            {versions.map((version) => (
              <article className={version.isActive ? "active" : ""} key={version.id}>
                <div className="playbook-v2-version-title">
                  <div>
                    <p className="eyebrow">
                      <VersionLabel version={version} />
                    </p>
                    <h3>{version.changeNote || "Versioned strategy record"}</h3>
                    <small>{new Date(version.createdAt).toLocaleString()}</small>
                  </div>
                  {version.isActive && <span className="status-badge active">Active</span>}
                </div>
                <dl>
                  <div>
                    <dt>Return</dt>
                    <dd>{formatMetric(version.return, "%")}</dd>
                  </div>
                  <div>
                    <dt>Sharpe</dt>
                    <dd>{formatMetric(version.sharpe)}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{version.evidenceScore}/100</dd>
                  </div>
                  <div>
                    <dt>Runs</dt>
                    <dd>{version.runCount}</dd>
                  </div>
                </dl>
                <div className="playbook-v2-version-actions">
                  <button
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      callAction(
                        `restore-${version.id}`,
                        `/api/playbooks/${encodeURIComponent(
                          playbook.id
                        )}/versions/${encodeURIComponent(version.id)}/restore`,
                        { body: {} }
                      )
                    }
                    type="button"
                  >
                    {busyAction === `restore-${version.id}`
                      ? "Creating Draft..."
                      : "Restore as Draft"}
                  </button>
                  {!version.isActive && (
                    <button
                      className="promote"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        callAction(
                          `promote-${version.id}`,
                          `/api/playbooks/${encodeURIComponent(
                            playbook.id
                          )}/versions/${encodeURIComponent(version.id)}/promote`,
                          { body: {} }
                        )
                      }
                      type="button"
                    >
                      {busyAction === `promote-${version.id}`
                        ? "Promoting..."
                        : "Promote"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {section === "Performance" && (
        <>
          {metrics.length > 0 && (
            <section className="playbook-v2-metrics">
              {metrics.map(([label, value]) => (
                <Metric key={label} label={label} value={value} />
              ))}
            </section>
          )}

          {(performance.equity_curve?.length > 0 ||
            performance.drawdown_curve?.length > 0) && (
            <section className="playbook-v2-charts">
              {performance.equity_curve?.length > 0 && (
                <article>
                  <p className="eyebrow">Recorded Return</p>
                  <div className="playbook-v2-chart">
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart data={performance.equity_curve}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" stroke="var(--muted)" />
                        <YAxis stroke="var(--muted)" />
                        <Tooltip />
                        <Line dataKey="value" dot={false} stroke="#58a6ff" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}
              {performance.drawdown_curve?.length > 0 && (
                <article>
                  <p className="eyebrow">Drawdown</p>
                  <div className="playbook-v2-chart">
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart data={performance.drawdown_curve}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" stroke="var(--muted)" />
                        <YAxis stroke="var(--muted)" />
                        <Tooltip />
                        <Line
                          dataKey="drawdown"
                          dot={false}
                          stroke="#ff6b6b"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              )}
            </section>
          )}

          {runs.length > 0 && (
            <section className="playbook-v2-runs">
              <div className="playbook-v2-table-row run heading">
                <span>Date</span>
                <span>Regime</span>
                <span>Benchmark</span>
                <span>Return</span>
                <span>Sharpe</span>
                <span>Drawdown</span>
                <span>Trades</span>
              </div>
              {runs.map((run) => (
                <div className="playbook-v2-table-row run" key={run.id}>
                  <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                  <span>{run.marketRegime || run.regime}</span>
                  <span>{run.benchmark}</span>
                  <span>{formatMetric(run.totalReturn, "%")}</span>
                  <span>{formatMetric(run.sharpe)}</span>
                  <span>{formatMetric(run.drawdown, "%")}</span>
                  <span>{run.trades}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {section === "Insights" && (
        <>
          {!evidence.eligible && (
            <section className="playbook-v2-warning">
              <h3>Deterministic insights are locked</h3>
              <p>
                The system will not infer winners, regimes, sectors, or parameter
                quality from an insufficient sample.
              </p>
            </section>
          )}

          {insights.length > 0 && (
            <section className="playbook-v2-insights">
              {insights.map((insight) => (
                <article key={insight.id}>
                  <div>
                    <span>{insight.type || insight.insightType}</span>
                    <strong>{insight.reliability}</strong>
                  </div>
                  <h3>{insight.title}</h3>
                  <p>{insight.explanation}</p>
                  <dl>
                    <div>
                      <dt>Sample</dt>
                      <dd>{insight.sampleSize}</dd>
                    </div>
                    <div>
                      <dt>Formula</dt>
                      <dd>{insight.formula}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </section>
          )}

          <section className="playbook-v2-ai">
            <div>
              <p className="eyebrow">AI Review Layer</p>
              <h3>Recommendations require a human decision</h3>
              <p>
                AI receives only aggregate metrics and validated insights. It cannot
                activate, edit, or run anything.
              </p>
            </div>
            <button
              disabled={isGeneratingAi || !evidence.eligible}
              onClick={onGenerateAi}
              type="button"
            >
              {isGeneratingAi ? "Reviewing..." : "Request AI Review"}
            </button>
          </section>

          {recommendations.length > 0 && (
            <section className="playbook-v2-recommendations">
              {recommendations.map((recommendation) => (
                <article key={recommendation.id}>
                  <div className="playbook-v2-version-title">
                    <div>
                      <p className="eyebrow">{recommendation.source}</p>
                      <h3>{recommendation.status.replaceAll("_", " ")}</h3>
                    </div>
                    <span className={`status-badge ${recommendation.status.toLowerCase()}`}>
                      {recommendation.status}
                    </span>
                  </div>
                  <pre>{JSON.stringify(recommendation.proposal, null, 2)}</pre>
                  {recommendation.status === "PENDING_REVIEW" && (
                    <div className="playbook-v2-version-actions">
                      <button
                        onClick={() =>
                          callAction(
                            `accept-${recommendation.id}`,
                            `/api/playbook-recommendations/${encodeURIComponent(
                              recommendation.id
                            )}/accept`,
                            { body: {} }
                          )
                        }
                        type="button"
                      >
                        Accept Review
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          callAction(
                            `reject-${recommendation.id}`,
                            `/api/playbook-recommendations/${encodeURIComponent(
                              recommendation.id
                            )}/reject`,
                            { body: {} }
                          )
                        }
                        type="button"
                      >
                        Reject
                      </button>
                      <button
                        className="promote"
                        onClick={() =>
                          callAction(
                            `draft-${recommendation.id}`,
                            `/api/playbook-recommendations/${encodeURIComponent(
                              recommendation.id
                            )}/convert-to-draft`,
                            { body: {} }
                          )
                        }
                        type="button"
                      >
                        Convert To Draft
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {section === "Audit & Export" && (
        <>
          <section className="playbook-v2-export">
            <div>
              <p className="eyebrow">Evidence Bundle</p>
              <h3>Export the operating record</h3>
              <p>Versions, formulas, runs, decisions, and recommendations are included.</p>
            </div>
            <div>
              <button onClick={() => onExport("json")} type="button">Export JSON</button>
              <button onClick={() => onExport("csv")} type="button">Export CSV</button>
              <button onClick={() => onExport("markdown")} type="button">
                Export Markdown
              </button>
            </div>
          </section>

          {auditTrail.length > 0 && (
            <section className="playbook-v2-audit">
              {auditTrail.map((event, index) => (
                <article key={`${event.type}-${event.created_at}-${index}`}>
                  <span>{event.type}</span>
                  <strong>{event.title}</strong>
                  <time>{new Date(event.created_at).toLocaleString()}</time>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
