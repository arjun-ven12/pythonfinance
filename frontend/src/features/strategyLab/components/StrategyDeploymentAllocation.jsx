import { useEffect, useMemo, useState } from "react";

const METHOD_OPTIONS = [
  { value: "EQUAL_WEIGHT", label: "Equal weight" },
  { value: "MANUAL_WEIGHT", label: "Manual weight" },
  { value: "RISK_PARITY", label: "Risk parity" },
  { value: "CONFIDENCE_WEIGHTED", label: "Confidence weighted" },
  { value: "EVIDENCE_WEIGHTED", label: "Evidence weighted" },
  { value: "VOLATILITY_ADJUSTED", label: "Volatility adjusted" },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}

function formatPct(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}%` : "0.0%";
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}/100` : "0/100";
}

function shortenLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\bLOW VOL\b/gi, "LV")
    .replace(/\bHIGH VOL\b/gi, "HV");
}

function stableSerialize(value) {
  return JSON.stringify(value ?? null);
}

function buildWeights(strategies, method) {
  const activeStrategies = strategies.filter((strategy) => strategy.status !== "BLOCKED");
  if (!activeStrategies.length) {
    return {};
  }

  if (method === "MANUAL_WEIGHT") {
    const total = activeStrategies.reduce(
      (sum, strategy) => sum + Math.max(0, toNumber(strategy.assignedCapitalPct, 0)),
      0
    );
    if (!total) {
      return {};
    }
    return Object.fromEntries(
      activeStrategies.map((strategy) => [
        strategy.experimentId,
        round((Math.max(0, toNumber(strategy.assignedCapitalPct, 0)) / total) * 100, 4),
      ])
    );
  }

  const weighted = activeStrategies.map((strategy) => {
    const basis =
      method === "RISK_PARITY"
        ? 1 / Math.max(Math.abs(toNumber(strategy.expectedDrawdown, 1)), 1)
        : method === "CONFIDENCE_WEIGHTED"
          ? Math.max(toNumber(strategy.validationScore, 1), 1)
          : method === "EVIDENCE_WEIGHTED"
            ? Math.max(toNumber(strategy.evidenceCount, 1), 1)
            : method === "VOLATILITY_ADJUSTED"
              ? 1 / Math.max(toNumber(strategy.volatility, 0.01), 0.01)
              : 1;
    return { experimentId: strategy.experimentId, basis };
  });
  const total = weighted.reduce((sum, item) => sum + item.basis, 0);
  return Object.fromEntries(
    weighted.map((item) => [item.experimentId, round((item.basis / total) * 100, 4)])
  );
}

function StatusBadge({ status }) {
  return <span className={`deployment-allocation-status deployment-allocation-status-${String(status || "").toLowerCase()}`}>{status}</span>;
}

export default function StrategyDeploymentAllocation({
  dashboard,
  matrixReplayResult,
  onRunMatrixReplay,
  onSave,
  runPeriod,
  runSymbol,
  runTopN,
  runUniverseId,
  runUniverseMode,
  saving,
  setRunPeriod,
  setRunSymbol,
  setRunTopN,
  setRunUniverseId,
  setRunUniverseMode,
  stockUniverses = [],
  runningMatrixReplay,
}) {
  const [allocationMethod, setAllocationMethod] = useState("EQUAL_WEIGHT");
  const [strategies, setStrategies] = useState([]);
  const [matrixCells, setMatrixCells] = useState([]);
  const [rebalanceFrequency, setRebalanceFrequency] = useState("WEEKLY");
  const [maxDriftPct, setMaxDriftPct] = useState("5");
  const [reasonNote, setReasonNote] = useState("");

  useEffect(() => {
    if (!dashboard) {
      return;
    }
    setAllocationMethod(dashboard.allocationMethod || "EQUAL_WEIGHT");
    setStrategies(dashboard.strategies || []);
    setMatrixCells(dashboard.matrix?.cells || []);
    setRebalanceFrequency(dashboard.rebalance?.frequency || "WEEKLY");
    setMaxDriftPct(String(dashboard.rebalance?.maxDriftPct ?? 5));
    setReasonNote("");
  }, [dashboard]);

  useEffect(() => {
    if (!strategies.length || allocationMethod === "MANUAL_WEIGHT") {
      return;
    }
    const weights = buildWeights(strategies, allocationMethod);
    setStrategies((current) =>
      current.map((strategy) => ({
        ...strategy,
        assignedCapitalPct: round(weights[strategy.experimentId] || 0),
      }))
    );
  }, [allocationMethod, dashboard?.generatedAt]);

  const strategyById = useMemo(
    () => new Map(strategies.map((strategy) => [strategy.experimentId, strategy])),
    [strategies]
  );

  const matrixRows = useMemo(() => {
    const sectors = dashboard?.matrix?.sectors || [];
    const regimes = dashboard?.matrix?.regimes || [];
    return sectors.map((sector) => ({
      sector,
      cells: regimes.map((regime) => {
        const key = `${sector}::${regime}`;
        return matrixCells.find((cell) => cell.key === key) || {
          key,
          sector,
          regime,
          selectedExperimentId: "",
          allocationPct: 0,
          status: "SIT_OUT",
        };
      }),
    }));
  }, [dashboard?.matrix?.regimes, dashboard?.matrix?.sectors, matrixCells]);

  const totalAssigned = useMemo(
    () => round(strategies.reduce((sum, strategy) => sum + toNumber(strategy.assignedCapitalPct, 0), 0)),
    [strategies]
  );

  const updateStrategy = (experimentId, field, value) => {
    setStrategies((current) =>
      current.map((strategy) =>
        strategy.experimentId === experimentId
          ? {
              ...strategy,
              [field]: field.includes("Pct") ? round(value) : value,
            }
          : strategy
      )
    );
  };

  const updateMatrixCell = (cellKey, changes) => {
    setMatrixCells((current) =>
      current.map((cell) => {
        if (cell.key !== cellKey) {
          return cell;
        }
        const nextCell = {
          ...cell,
          ...changes,
        };
        if (!nextCell.selectedExperimentId || nextCell.status === "SIT_OUT") {
          nextCell.selectedExperimentId = "";
          nextCell.selectedStrategyVersionId = "";
          nextCell.strategyName = null;
          nextCell.allocationPct = 0;
          nextCell.status = "SIT_OUT";
          nextCell.evidenceStatus = "Sit out";
          return nextCell;
        }
        const selectedStrategy = strategyById.get(nextCell.selectedExperimentId);
        nextCell.selectedStrategyVersionId = selectedStrategy?.strategyVersionId || "";
        nextCell.strategyName = selectedStrategy?.name || null;
        nextCell.evidenceStatus = selectedStrategy?.status === "BLOCKED" ? "Pending evidence" : "Validated";
        return nextCell;
      })
    );
  };

  const savePayload = {
    allocationMethod,
    strategies,
    matrix: { cells: matrixCells },
    rebalance: {
      frequency: rebalanceFrequency,
      maxDriftPct: toNumber(maxDriftPct, 5),
    },
    reasonNote,
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!dashboard) {
      return false;
    }

    return (
      stableSerialize({
        allocationMethod,
        strategies,
        matrixCells,
        rebalanceFrequency,
        maxDriftPct: toNumber(maxDriftPct, 5),
      }) !==
      stableSerialize({
        allocationMethod: dashboard.allocationMethod || "EQUAL_WEIGHT",
        strategies: dashboard.strategies || [],
        matrixCells: dashboard.matrix?.cells || [],
        rebalanceFrequency: dashboard.rebalance?.frequency || "WEEKLY",
        maxDriftPct: toNumber(dashboard.rebalance?.maxDriftPct, 5),
      })
    );
  }, [
    allocationMethod,
    dashboard,
    matrixCells,
    maxDriftPct,
    rebalanceFrequency,
    strategies,
  ]);

  if (!dashboard) {
    return (
      <section className="strategy-lab-card">
        <p className="alerts-empty">Loading deployment allocation workspace...</p>
      </section>
    );
  }

  return (
    <section className="deployment-allocation-layout">
      <section className="strategy-library-hero">
        <div>
          <p className="eyebrow">Deployment & Allocation</p>
          <h2>Route validated strategies and assign capital</h2>
          <p>
            Build strategy, validate it, route it to sector × regime contexts, then size capital
            without touching live broker execution.
          </p>
        </div>
        <div className="strategy-library-hero-stats">
          <article>
            <span>Capital assigned</span>
            <strong>{formatPct(totalAssigned, 0)}</strong>
          </article>
          <article>
            <span>Routed strategies</span>
            <strong>{dashboard.activeSet?.routedStrategies?.length || 0}</strong>
          </article>
          <article>
            <span>Guardrails</span>
            <strong>{dashboard.guardrails?.valid ? "Pass" : "Review"}</strong>
          </article>
        </div>
      </section>

      <div className="deployment-allocation-grid">
        <section className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Active Deployment Set</p>
              <h2>{dashboard.activeSet?.owner?.name || "No routing owner"}</h2>
            </div>
            <span>
              {dashboard.activeSet?.owner?.version
                ? `v${dashboard.activeSet.owner.version}`
                : "Not activated"}
            </span>
          </div>
          <div className="deployment-allocation-owner-grid">
            <article>
              <span>Pending evidence</span>
              <strong>{dashboard.activeSet?.pendingEvidence?.length || 0}</strong>
            </article>
            <article>
              <span>Sit-out contexts</span>
              <strong>{dashboard.activeSet?.sitOutContexts?.length || 0}</strong>
            </article>
            <article>
              <span>Active versions</span>
              <strong>{dashboard.activeSet?.activeStrategyVersions?.length || 0}</strong>
            </article>
          </div>
          <div className="deployment-allocation-token-list">
            {(dashboard.activeSet?.routedStrategies || []).map((strategy) => (
              <span className="strategy-library-context-pill" key={strategy.experimentId}>
                {strategy.name} · v{strategy.version || "-"}
              </span>
            ))}
          </div>
        </section>

        <section className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Capital Allocation</p>
              <h2>Strategy weights</h2>
            </div>
            <label className="deployment-allocation-method">
              <span>Method</span>
              <select value={allocationMethod} onChange={(event) => setAllocationMethod(event.target.value)}>
                {METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="deployment-allocation-table">
            <div className="deployment-allocation-table-head">
              <span>Strategy</span>
              <span>Scope</span>
              <span>Scores</span>
              <span>Capital</span>
              <span>Status</span>
            </div>
            {strategies.map((strategy) => (
              <div className="deployment-allocation-table-row" key={strategy.experimentId}>
                <div>
                  <strong>{strategy.name}</strong>
                  <p>v{strategy.version || "-"}</p>
                </div>
                <div>
                  <p>{strategy.routedRegimes?.map(shortenLabel).join(", ") || "No regimes"}</p>
                  <p>{strategy.routedSectors?.map(shortenLabel).join(", ") || "No sectors"}</p>
                </div>
                <div>
                  <p>Readiness {formatScore(strategy.readinessScore)}</p>
                  <p>Validation {formatScore(strategy.validationScore)} · Robustness {formatScore(strategy.robustnessScore)}</p>
                </div>
                <div className="deployment-allocation-weight-controls">
                  <label>
                    <span>Assigned</span>
                    <input
                      className="st-input"
                      disabled={allocationMethod !== "MANUAL_WEIGHT"}
                      min="0"
                      max="100"
                      step="0.5"
                      type="number"
                      value={strategy.assignedCapitalPct ?? 0}
                      onChange={(event) => updateStrategy(strategy.experimentId, "assignedCapitalPct", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Max</span>
                    <input
                      className="st-input"
                      min="0"
                      max="100"
                      step="0.5"
                      type="number"
                      value={strategy.maxAllocationPct ?? 0}
                      onChange={(event) => updateStrategy(strategy.experimentId, "maxAllocationPct", event.target.value)}
                    />
                  </label>
                </div>
                <div>
                  <StatusBadge status={strategy.status} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="strategy-lab-card deployment-allocation-matrix-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Allocation Matrix</p>
              <h2>Sector × regime routing</h2>
            </div>
            <div className="deployment-allocation-header-actions">
              <span>One strategy per cell</span>
              <button
                type="button"
                onClick={() => onSave(savePayload)}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? "Saving..." : hasUnsavedChanges ? "Save changes" : "Saved"}
              </button>
            </div>
          </div>
          <div className="deployment-allocation-matrix">
            <div
              className="strategy-library-active-grid"
              style={{
                gridTemplateColumns: `minmax(170px, 200px) repeat(${Math.max(
                  dashboard.matrix?.regimes?.length || 1,
                  1
                )}, minmax(180px, 1fr))`,
              }}
            >
              <span className="strategy-library-grid-corner" />
              {(dashboard.matrix?.regimes || []).map((regime) => (
                <span className="strategy-library-grid-header" key={regime}>
                  {shortenLabel(regime)}
                </span>
              ))}

              {matrixRows.map((row) => (
                <div className="strategy-library-grid-row" key={row.sector}>
                  <span className="strategy-library-grid-sector">{shortenLabel(row.sector)}</span>
                  {row.cells.map((cell) => (
                    <div className={`deployment-allocation-cell is-${String(cell.status || "").toLowerCase()}`} key={cell.key}>
                      <select
                        value={cell.selectedExperimentId || ""}
                        onChange={(event) =>
                          updateMatrixCell(cell.key, {
                            selectedExperimentId: event.target.value,
                            selectedStrategyVersionId:
                              strategyById.get(event.target.value)?.strategyVersionId || "",
                            strategyName: strategyById.get(event.target.value)?.name || null,
                            allocationPct:
                              event.target.value && toNumber(cell.allocationPct, 0) <= 0
                                ? round(
                                    toNumber(
                                      strategyById.get(event.target.value)?.assignedCapitalPct,
                                      0
                                    ) || 0
                                  )
                                : cell.allocationPct,
                            status: event.target.value ? "ACTIVE" : "SIT_OUT",
                            evidenceStatus: event.target.value ? "Pending evidence" : "Sit out",
                          })
                        }
                      >
                        <option value="">Sit out</option>
                        {strategies.map((strategy) => (
                          <option key={strategy.experimentId} value={strategy.experimentId}>
                            {strategy.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="st-input"
                        min="0"
                        max="100"
                        step="0.5"
                        type="number"
                        value={cell.allocationPct ?? 0}
                        onChange={(event) =>
                          updateMatrixCell(cell.key, {
                            allocationPct: event.target.value,
                          })
                        }
                      />
                      <div className="deployment-allocation-cell-meta">
                        <span>{cell.evidenceStatus || "Sit out"}</span>
                        <StatusBadge status={cell.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Portfolio Simulation</p>
              <h2>Combined strategy plan</h2>
            </div>
            <button type="button" onClick={() => onRunMatrixReplay?.()} disabled={runningMatrixReplay}>
              {runningMatrixReplay ? "Replaying..." : "Run Matrix Replay"}
            </button>
          </div>
          <div className="deployment-allocation-rebalance-controls">
            <label>
              <span>Universe mode</span>
              <select
                value={runUniverseMode}
                onChange={(event) => setRunUniverseMode?.(event.target.value)}
              >
                <option value="SINGLE">Single / typed symbols</option>
                <option value="UNIVERSE">Saved stock universe</option>
                <option value="SP500_TOP_N">S&amp;P 500 top N</option>
              </select>
            </label>
            {runUniverseMode === "UNIVERSE" && (
              <label>
                <span>Stock universe</span>
                <select
                  value={runUniverseId}
                  onChange={(event) => setRunUniverseId?.(event.target.value)}
                >
                  <option value="">Select universe</option>
                  {stockUniverses.map((universe) => (
                    <option key={universe.id} value={universe.id}>
                      {universe.name} ({universe.members?.length || 0})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {runUniverseMode === "SP500_TOP_N" && (
              <label>
                <span>Top N</span>
                <input
                  className="st-input"
                  max="100"
                  min="1"
                  type="number"
                  value={runTopN}
                  onChange={(event) => setRunTopN?.(event.target.value)}
                />
              </label>
            )}
            <label>
              <span>Symbols</span>
              <input
                className="st-input"
                disabled={runUniverseMode !== "SINGLE"}
                placeholder="AAPL, MSFT, NVDA"
                value={runSymbol}
                onChange={(event) => setRunSymbol?.(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              <span>Period</span>
              <select
                value={runPeriod}
                onChange={(event) => setRunPeriod?.(event.target.value)}
              >
                <option value="6mo">6mo</option>
                <option value="1y">1y</option>
                <option value="2y">2y</option>
                <option value="5y">5y</option>
              </select>
            </label>
          </div>
          <div className="strategy-evidence-metrics">
            <article>
              <span>Expected return</span>
              <strong>{formatPct(dashboard.simulation?.metrics?.expectedReturn)}</strong>
            </article>
            <article>
              <span>Expected drawdown</span>
              <strong>{formatPct(dashboard.simulation?.metrics?.expectedDrawdown)}</strong>
            </article>
            <article>
              <span>Sharpe</span>
              <strong>{round(dashboard.simulation?.metrics?.sharpe || 0, 2)}</strong>
            </article>
            <article>
              <span>Capital usage</span>
              <strong>{formatPct(dashboard.simulation?.metrics?.capitalUsage || 0)}</strong>
            </article>
          </div>
          <div className="deployment-allocation-exposure-grid">
            <div>
              <span className="eyebrow">Sector exposure</span>
              {(dashboard.simulation?.sectorExposure || []).map((item) => (
                <p key={item.sector}>{shortenLabel(item.sector)} · {formatPct(item.allocationPct)}</p>
              ))}
            </div>
            <div>
              <span className="eyebrow">Regime exposure</span>
              {(dashboard.simulation?.regimeExposure || []).map((item) => (
                <p key={item.regime}>{shortenLabel(item.regime)} · {formatPct(item.allocationPct)}</p>
              ))}
            </div>
          </div>
          {matrixReplayResult?.result ? (
            <>
              <div className="strategy-evidence-metrics">
                <article>
                  <span>Replay return</span>
                  <strong>{formatPct(matrixReplayResult.result.total_return_pct)}</strong>
                </article>
                <article>
                  <span>Replay drawdown</span>
                  <strong>{formatPct(matrixReplayResult.result.max_drawdown_pct)}</strong>
                </article>
                <article>
                  <span>Replay Sharpe</span>
                  <strong>{round(matrixReplayResult.result.sharpe || 0, 2)}</strong>
                </article>
                <article>
                  <span>Replay trades</span>
                  <strong>{matrixReplayResult.result.completed_trades || 0}</strong>
                </article>
              </div>
              <div className="deployment-allocation-violations">
                <p>
                  Deployment {matrixReplayResult.result.deploymentVersionId || "n/a"} replayed across{" "}
                  {Array.isArray(matrixReplayResult.result.symbols) ? matrixReplayResult.result.symbols.length : 0} symbols.
                </p>
              </div>
            </>
          ) : (
            <p className="alerts-empty">Run a matrix replay to see how the exact deployment plan performs historically.</p>
          )}
        </section>

        <section className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Allocation Guardrails</p>
              <h2>Block unsafe capital plans</h2>
            </div>
            <span>{dashboard.guardrails?.valid ? "All clear" : "Needs action"}</span>
          </div>
          <div className="deployment-allocation-token-list">
            <span className="strategy-library-chip strategy-library-chip-outline">
              Min trades {dashboard.guardrails?.config?.minimumTrades}
            </span>
            <span className="strategy-library-chip strategy-library-chip-outline">
              Min validation {dashboard.guardrails?.config?.minimumValidationScore}%
            </span>
            <span className="strategy-library-chip strategy-library-chip-outline">
              Max sector {dashboard.guardrails?.config?.maxSectorExposurePct}%
            </span>
          </div>
          {dashboard.guardrails?.violations?.length ? (
            <div className="deployment-allocation-violations">
              {dashboard.guardrails.violations.map((violation) => (
                <p key={violation}>{violation}</p>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No guardrail breaks in the current plan.</p>
          )}
        </section>

        <section className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Rebalancing</p>
              <h2>Review drift only</h2>
            </div>
            <span>Manual review</span>
          </div>
          <div className="deployment-allocation-rebalance-controls">
            <label>
              <span>Frequency</span>
              <select value={rebalanceFrequency} onChange={(event) => setRebalanceFrequency(event.target.value)}>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </label>
            <label>
              <span>Max drift %</span>
              <input
                className="st-input"
                min="0"
                max="100"
                step="0.5"
                type="number"
                value={maxDriftPct}
                onChange={(event) => setMaxDriftPct(event.target.value)}
              />
            </label>
          </div>
          <div className="deployment-allocation-violations">
            {(dashboard.rebalance?.suggestions || []).map((suggestion) => (
              <p key={`${suggestion.strategyName || "rebalance"}-${suggestion.action}`}>
                {suggestion.strategyName ? `${suggestion.strategyName}: ` : ""}
                {suggestion.action}
              </p>
            ))}
          </div>
        </section>
      </div>

      <section className="strategy-lab-card">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Audit Trail</p>
            <h2>Allocation changes</h2>
          </div>
          <button
            type="button"
            onClick={() => onSave(savePayload)}
            disabled={saving || !hasUnsavedChanges}
          >
            {saving ? "Saving..." : hasUnsavedChanges ? "Save Allocation Plan" : "Saved"}
          </button>
        </div>
        <label className="deployment-allocation-reason">
          <span>Reason note</span>
          <textarea
            className="st-input"
            rows="3"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            placeholder="Why are we changing the deployment mix?"
          />
        </label>
        <details className="deployment-allocation-audit">
          <summary>Show audit entries</summary>
          <div className="approval-audit-list">
            {(dashboard.auditLogs || []).length ? (
              dashboard.auditLogs.map((log) => (
                <article key={log.id}>
                  <span>{log.action}</span>
                  <strong>{new Date(log.createdAt).toLocaleString()}</strong>
                  <p>
                    {(log.actor?.email || "Unknown user")}
                    {log.strategyName ? ` · ${log.strategyName}` : ""}
                  </p>
                  <p>{log.reasonNote || "No reason note recorded."}</p>
                </article>
              ))
            ) : (
              <p className="alerts-empty">No allocation changes have been audited yet.</p>
            )}
          </div>
        </details>
      </section>
    </section>
  );
}
