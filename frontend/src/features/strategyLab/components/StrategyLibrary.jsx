import { useMemo, useState } from "react";

const STRATEGY_TONES = ["azure", "emerald", "violet", "amber", "cyan", "rose"];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value, digits = 1) {
  const numeric = toNumber(value);
  return numeric === null ? "Not available" : `${numeric.toFixed(digits)}%`;
}

function toneForIndex(index) {
  return STRATEGY_TONES[index % STRATEGY_TONES.length];
}

function shortenLabel(value) {
  const label = String(value || "").trim();
  if (!label) return "";
  return label
    .replace(/_/g, " ")
    .replace(/\bLOW VOL\b/gi, "LV")
    .replace(/\bHIGH VOL\b/gi, "HV")
    .replace(/\bCOMMUNICATION SERVICES\b/gi, "Comm Svcs")
    .replace(/\bCONSUMER DISCRETIONARY\b/gi, "Cons Disc")
    .replace(/\bCONSUMER STAPLES\b/gi, "Cons Staples")
    .replace(/\bINFORMATION TECHNOLOGY\b/gi, "Technology");
}

function getValidatedContexts(lifecycle) {
  const rows = lifecycle?.realizedPerformance?.bySectorRegime || [];
  return rows.filter(
    (row) => Number(row.sampleCount || 0) >= 30 && Number(row.hitRate || 0) >= 45
  );
}

function getEnvelopeContexts(experiment, lifecycle) {
  const envelope =
    lifecycle?.envelope ||
    experiment?.settingsJson?.strategyJson?.executable?.envelope ||
    {};
  const sectors = Array.isArray(envelope.sectors)
    ? [...new Set(envelope.sectors.filter(Boolean))]
    : [];
  const regimes = Array.isArray(envelope.regimes)
    ? [...new Set(envelope.regimes.filter(Boolean))]
    : [];
  if (!sectors.length || !regimes.length) {
    return [];
  }

  const evidenceRows = lifecycle?.realizedPerformance?.bySectorRegime || [];
  const evidenceByKey = new Map(
    evidenceRows.map((row) => [`${row.sector}::${row.regime}`, row])
  );

  return sectors.flatMap((sector) =>
    regimes.map((regime) => {
      const evidence = evidenceByKey.get(`${sector}::${regime}`) || null;
      const sampleCount = Number(evidence?.sampleCount || 0);
      const hitRate = Number(evidence?.hitRate || 0);
      return {
        sector,
        regime,
        sampleCount,
        hitRate,
        evidenceReady: sampleCount >= 30 && hitRate >= 45,
      };
    })
  );
}

function getPendingEvidenceReason(experiment, lifecycle) {
  if (!experiment?.runs?.length) {
    return "Save and run a backtest first.";
  }

  const rows = lifecycle?.realizedPerformance?.bySectorRegime || [];
  if (!rows.length) {
    return "No sector × regime validation has matured yet.";
  }

  const strongest = [...rows].sort(
    (left, right) => Number(right.sampleCount || 0) - Number(left.sampleCount || 0)
  )[0];

  if (!strongest) {
    return "No validated contexts are available yet.";
  }

  const sampleCount = Number(strongest.sampleCount || 0);
  const hitRate = Number(strongest.hitRate || 0);

  if (sampleCount < 30) {
    return `${sampleCount} trades recorded; below the 30-trade evidence gate.`;
  }

  return `${shortenLabel(strongest.sector)} + ${shortenLabel(strongest.regime)} is only ${hitRate.toFixed(
    1
  )}% hit rate; below the 45% gate.`;
}

function getLibraryStatus(experiment, lifecycle, membershipEntry) {
  const rawStatus = String(experiment?.status || "").toUpperCase();
  if (rawStatus === "ARCHIVED") {
    return { key: "archived", label: "Archived" };
  }
  if (rawStatus === "PAUSED") {
    return { key: "paused", label: "Paused" };
  }

  if (membershipEntry?.activeContexts) {
    return {
      key: "active",
      label: `In active set · ${membershipEntry.activeContexts} context${
        membershipEntry.activeContexts === 1 ? "" : "s"
      }`,
    };
  }

  const validatedContexts = getValidatedContexts(lifecycle);
  if (validatedContexts.length > 0) {
    return { key: "ready", label: "Routing ready" };
  }

  if (!experiment?.runs?.length) {
    return { key: "draft", label: "Draft" };
  }

  const rows = lifecycle?.realizedPerformance?.bySectorRegime || [];
  if (rows.length > 0) {
    return {
      key: "insufficient",
      label: `Insufficient evidence · ${getPendingEvidenceReason(experiment, lifecycle)}`,
    };
  }

  return { key: "tested", label: "Tested" };
}

function getScope(experiment, lifecycle) {
  const envelope =
    lifecycle?.envelope ||
    experiment?.settingsJson?.strategyJson?.executable?.envelope ||
    {};
  const regimes = (envelope.regimes || []).map(shortenLabel).filter(Boolean);
  const sectors = (envelope.sectors || []).map(shortenLabel).filter(Boolean);
  const instrumentTypes = (envelope.instrumentTypes || []).map(shortenLabel).filter(Boolean);
  const primaryInstrument = instrumentTypes[0] || "Any instrument";

  return {
    regimes,
    sectors,
    instrumentTypes,
    summary: `Scope · ${regimes.length || "All"} regime${regimes.length === 1 ? "" : "s"} · ${
      sectors.length ? `${sectors.length} sector${sectors.length === 1 ? "" : "s"}` : primaryInstrument
    }`,
  };
}

function StatusPill({ status }) {
  if (status.key === "active") {
    return (
      <span className="strategy-library-status strategy-library-status-active">
        <span aria-hidden="true">●</span> {status.label}
      </span>
    );
  }
  if (status.key === "ready") {
    return (
      <span className="strategy-library-status strategy-library-status-ready">
        <span aria-hidden="true">+</span> {status.label}
      </span>
    );
  }
  if (status.key === "insufficient") {
    return (
      <span className="strategy-library-status strategy-library-status-warn">
        <span aria-hidden="true">!</span> {status.label}
      </span>
    );
  }
  return <span className={`strategy-library-status strategy-library-status-${status.key}`}>{status.label}</span>;
}

function normalizeContextKey(context) {
  return `${String(context?.sector || "").trim()}::${String(context?.regime || "").trim()}`;
}

function summarizeCell(cell) {
  if (!cell) {
    return {
      status: "sit",
      label: "Sit out",
      tone: "neutral",
      description: "No strategy is routed to this context. Not trading a context without evidence is an explicit decision.",
    };
  }

  if (cell.active) {
    return {
      status: "active",
      label: cell.strategyName,
      tone: cell.tone || "azure",
      description: `${cell.strategyName} is live for this sector × regime context.`,
    };
  }

  return {
    status: "pending",
    label: "Pending evidence",
    tone: "amber",
    description: "A candidate strategy exists, but this context has not cleared the evidence gate yet.",
  };
}

function statusForMatrixCell(cell, summary) {
  if (summary.status === "active") return "ACTIVE";
  if (summary.status === "pending") return "PENDING";
  return "SIT_OUT";
}

export default function StrategyLibrary({
  activeSetData,
  activeStrategyExperiment,
  activeStrategyExperimentId,
  experiments,
  onAssignToActiveSet,
  onDelete,
  onDuplicate,
  onEdit,
  onRemoveFromActiveSet,
  routingActionLoading,
  selectedExperiment,
  setSelectedExperimentId,
  setSelectedRunId,
  strategyDeploymentAllocation,
  strategyLifecycleDashboard,
}) {
  const [routingExperimentId, setRoutingExperimentId] = useState("");
  const [selectedContextKeys, setSelectedContextKeys] = useState([]);
  const [routingFeedback, setRoutingFeedback] = useState(null);

  const lifecycleByExperimentId = useMemo(
    () =>
      new Map(
        (strategyLifecycleDashboard?.strategies || []).map((strategy) => [strategy.experimentId, strategy])
      ),
    [strategyLifecycleDashboard]
  );

  const strategiesByExperimentId = useMemo(
    () =>
      new Map(
        (experiments || []).map((experiment, index) => [
          experiment.id,
          { ...experiment, tone: toneForIndex(index) },
        ])
      ),
    [experiments]
  );

  const activeSet = useMemo(() => {
    const deploymentMatrixCells = Array.isArray(strategyDeploymentAllocation?.matrix?.cells)
      ? strategyDeploymentAllocation.matrix.cells
      : [];
    const cells = deploymentMatrixCells.length
      ? deploymentMatrixCells.map((cell) => ({
          ...cell,
          experimentId: cell.selectedExperimentId || null,
          strategyName: cell.strategyName || null,
          active: String(cell.status || "").toUpperCase() === "ACTIVE",
        }))
      : Array.isArray(activeSetData?.cells)
        ? activeSetData.cells
        : [];
    const cellsByKey = new Map(
      cells.map((cell) => {
        const experimentTone = strategiesByExperimentId.get(cell.experimentId)?.tone || "azure";
        return [
          cell.key || `${cell.sector}::${cell.regime}`,
          {
            ...cell,
            tone: experimentTone,
          },
        ];
      })
    );

    const membershipByExperimentId = new Map(
      (activeSetData?.membership || []).map((entry) => [entry.experimentId, entry])
    );

    return {
      active:
        Boolean(strategyDeploymentAllocation?.activeSet?.owner) || Boolean(activeSetData?.active),
      owner: strategyDeploymentAllocation?.activeSet?.owner || activeSetData?.owner || null,
      sectors:
        strategyDeploymentAllocation?.matrix?.sectors ||
        activeSetData?.sectors ||
        [],
      regimes:
        strategyDeploymentAllocation?.matrix?.regimes ||
        activeSetData?.regimes ||
        [],
      cellsByKey,
      membershipByExperimentId,
      routed:
        strategyDeploymentAllocation?.matrix?.cells?.filter(
          (cell) => String(cell.status || "").toUpperCase() === "ACTIVE"
        ).length || Number(activeSetData?.routed || 0),
      pending:
        strategyDeploymentAllocation?.matrix?.cells?.filter(
          (cell) => String(cell.status || "").toUpperCase() === "PENDING"
        ).length || Number(activeSetData?.pending || 0),
      sitOut:
        strategyDeploymentAllocation?.matrix?.cells?.filter(
          (cell) => String(cell.status || "").toUpperCase() === "SIT_OUT"
        ).length || Number(activeSetData?.sitOut || 0),
      strategies: (
        strategyDeploymentAllocation?.activeSet?.routedStrategies ||
        activeSetData?.membership ||
        []
      ).map((entry) => ({
        ...entry,
        strategyName: entry.strategyName || entry.name || null,
        tone: strategiesByExperimentId.get(entry.experimentId)?.tone || "azure",
      })),
    };
  }, [activeSetData, strategiesByExperimentId, strategyDeploymentAllocation]);

  const selectedRoutingExperiment =
    experiments.find((experiment) => experiment.id === routingExperimentId) || null;
  const selectedRoutingMembership =
    activeSet.membershipByExperimentId.get(selectedRoutingExperiment?.id) || null;
  const assignedContextKeySet = new Set(
    Array.from(activeSet.cellsByKey.values())
      .filter(
        (cell) =>
          cell.experimentId === selectedRoutingExperiment?.id &&
          String(cell.status || "").toUpperCase() !== "SIT_OUT"
      )
      .map((cell) => cell.key || `${cell.sector}::${cell.regime}`)
  );

  const fallbackMatrix = useMemo(() => {
    const sourceStrategies = strategyLifecycleDashboard?.strategies || [];
    const sectors = [
      ...new Set(
        sourceStrategies.flatMap((strategy) => strategy?.envelope?.sectors || []).filter(Boolean)
      ),
    ];
    const regimes = [
      ...new Set(
        sourceStrategies.flatMap((strategy) => strategy?.envelope?.regimes || []).filter(Boolean)
      ),
    ];
    return {
      sectors,
      regimes,
    };
  }, [strategyLifecycleDashboard]);

  const matrixSectors = activeSet.sectors.length ? activeSet.sectors : fallbackMatrix.sectors;
  const matrixRegimes = activeSet.regimes.length ? activeSet.regimes : fallbackMatrix.regimes;

  const displayMatrixRows = useMemo(
    () =>
      matrixSectors.map((sector) => ({
        sector,
        cells: matrixRegimes.map((regime) => {
          const key = `${sector}::${regime}`;
          return {
            key,
            sector,
            regime,
            cell: activeSet.cellsByKey.get(key) || null,
          };
        }),
      })),
    [activeSet.cellsByKey, matrixRegimes, matrixSectors]
  );

  const toggleContext = (contextKey) => {
    setRoutingFeedback(null);
    setSelectedContextKeys((current) =>
      current.includes(contextKey)
        ? current.filter((value) => value !== contextKey)
        : [...current, contextKey]
    );
  };

  const openRoutingManager = (experimentId) => {
    setRoutingExperimentId((current) => (current === experimentId ? "" : experimentId));
    setSelectedContextKeys([]);
    setRoutingFeedback(null);
  };

  return (
    <section className="strategy-library-layout">
      <section className="strategy-library-hero">
        <div>
          <p className="eyebrow">Active Deployment Set</p>
          <h2>{activeSet.strategies.length || 0} strategies routed</h2>
          <p>
            The active set is derived from the live sector × regime allocation matrix. Multiple
            strategies can be live, but one candidate still resolves to one cell and one strategy.
          </p>
        </div>
        <div className="strategy-library-hero-stats">
          <article>
            <span>Routed</span>
            <strong>{activeSet.routed}</strong>
          </article>
          <article>
            <span>Pending evidence</span>
            <strong>{activeSet.pending}</strong>
          </article>
          <article>
            <span>Sit out</span>
            <strong>{activeSet.sitOut}</strong>
          </article>
        </div>
      </section>

      {(matrixSectors.length > 0 || matrixRegimes.length > 0) && (
        <section className="strategy-library-active-set">
          <div className="strategy-library-routing-hero">
            <div className="strategy-library-routing-icon" aria-hidden="true">
              ⎇
            </div>
            <div className="strategy-library-routing-copy">
              <p className="eyebrow">Active Deployment Set</p>
              <div className="strategy-library-routing-title-row">
                <h2>Routing policy</h2>
                <span
                  className={`strategy-library-routing-live ${
                    activeSet.active ? "is-live" : "is-idle"
                  }`}
                >
                  <span aria-hidden="true">●</span>
                  {activeSet.active ? "Live" : "Idle"}
                </span>
              </div>
              <p>
                Each candidate routes to exactly one cell: its sector × the current regime. That
                cell determines which validated strategy is allowed to act.
              </p>
            </div>
            <div className="strategy-library-routing-counts">
              <span className="strategy-library-routing-count-item">
                <strong>{activeSet.routed}</strong> routed
              </span>
              <span className="strategy-library-routing-separator">·</span>
              <span className="strategy-library-routing-count-item pending">
                <strong>{activeSet.pending}</strong> pending evidence
              </span>
              <span className="strategy-library-routing-separator">·</span>
              <span className="strategy-library-routing-count-item">
                <strong>{activeSet.sitOut}</strong> sit out
              </span>
            </div>
          </div>

          <div className="strategy-library-routing-surface">
            <div
              className="strategy-library-active-grid strategy-library-policy-grid"
              style={{
                gridTemplateColumns: `minmax(180px, 210px) repeat(${Math.max(
                  matrixRegimes.length,
                  1
                )}, minmax(180px, 1fr))`,
              }}
            >
              <span className="strategy-library-grid-corner" />
              {matrixRegimes.map((regime) => (
                <span className="strategy-library-grid-header" key={regime}>
                  {shortenLabel(regime)}
                </span>
              ))}

              {displayMatrixRows.map((row) => (
                <div className="strategy-library-grid-row" key={row.sector}>
                  <span className="strategy-library-grid-sector">{shortenLabel(row.sector)}</span>
                  {row.cells.map((entry) => {
                    const summary = summarizeCell(entry.cell);
                    const status = statusForMatrixCell(entry.cell, summary);
                    return (
                      <div
                        className={`deployment-allocation-cell strategy-library-policy-cell is-${status.toLowerCase()} ${
                          entry.cell?.tone ? `tone-${entry.cell.tone}` : ""
                        }`}
                        key={entry.key}
                        title={`${shortenLabel(entry.sector)} · ${shortenLabel(entry.regime)} · ${summary.label}`}
                      >
                        <div className="strategy-library-policy-select">
                          {summary.status === "active"
                            ? entry.cell?.strategyName || summary.label
                            : summary.label}
                        </div>
                        <div className="strategy-library-policy-allocation">
                          {entry.cell?.allocationPct ?? 0}
                        </div>
                        <div className="deployment-allocation-cell-meta">
                          <span>
                            {summary.status === "active"
                              ? "Validated"
                              : summary.status === "pending"
                                ? "Pending evidence"
                                : "Sit out"}
                          </span>
                          <span className={`deployment-allocation-status deployment-allocation-status-${status.toLowerCase()}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="strategy-library-routing-explainer">
              Each candidate routes to exactly one cell — its sector × the current regime — so
              routing is deterministic and the cell is the performance attribution.
            </p>

            <div className="strategy-library-routing-bottom">
              <div className="strategy-library-routing-legend-block">
                <span className="eyebrow">Legend</span>
                <div className="strategy-library-routing-legend-list">
                  {(activeSet.strategies || []).map((strategy) => (
                    <div className="strategy-library-legend-row" key={strategy.experimentId}>
                      <span className={`strategy-library-swatch tone-${strategy.tone}`} />
                      <strong>{strategy.strategyName || strategy.name}</strong>
                    </div>
                  ))}
                  <div className="strategy-library-legend-row">
                    <span className="strategy-library-swatch pending" />
                    <strong>Insufficient evidence</strong>
                  </div>
                  <div className="strategy-library-legend-row">
                    <span className="strategy-library-swatch sit" />
                    <strong>Sit out</strong>
                  </div>
                </div>
              </div>

              <div className="strategy-library-routing-note">
                Most contexts sit out by design. Not trading a regime where you have no edge is a
                decision, not a gap.
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="strategy-library-main">
        <article className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Strategy Library</p>
              <h2>{experiments.length} saved</h2>
            </div>
            <span>
              {activeStrategyExperiment
                ? `${activeStrategyExperiment.name} owns the live routing matrix`
                : "No routing owner is active yet"}
            </span>
          </div>

          {experiments.length > 0 ? (
            <div className="strategy-library-card-list">
              {experiments.map((experiment, index) => {
                const lifecycle = lifecycleByExperimentId.get(experiment.id);
                const membershipEntry = activeSet.membershipByExperimentId.get(experiment.id);
                const status = getLibraryStatus(experiment, lifecycle, membershipEntry);
                const scope = getScope(experiment, lifecycle);
                const validatedContexts = getValidatedContexts(lifecycle).slice(0, 4);
                const assignableContexts = getEnvelopeContexts(experiment, lifecycle);
                const latestRun = experiment.runs?.[0];
                const tone = toneForIndex(index);
                const disabledReason =
                  status.key === "draft"
                    ? "Save and run a backtest first."
                    : assignableContexts.length === 0
                      ? "Add sector and regime scope to this strategy first."
                        : "";
                const isRoutingOpen = routingExperimentId === experiment.id;

                return (
                  <article
                    className={`strategy-library-card ${
                      selectedExperiment?.id === experiment.id ? "selected" : ""
                    }`}
                    key={experiment.id}
                    onClick={() => {
                      setSelectedExperimentId(experiment.id);
                      setSelectedRunId(experiment.runs?.[0]?.id || "");
                    }}
                  >
                    <div className="strategy-library-card-top">
                      <div>
                        <div className="strategy-library-name-row">
                          <strong>{experiment.name}</strong>
                          {activeStrategyExperimentId === experiment.id && (
                            <span className="strategy-library-live-badge">Routing owner</span>
                          )}
                        </div>
                        <p>{experiment.description || "No description."}</p>
                      </div>
                      <StatusPill status={status} />
                    </div>

                    <div className="strategy-library-scope">
                      <div className="strategy-library-scope-chips">
                        {scope.regimes.slice(0, 3).map((regime) => (
                          <span className={`strategy-library-chip tone-${tone}`} key={`${experiment.id}-${regime}`}>
                            {regime}
                          </span>
                        ))}
                        {scope.sectors.slice(0, 3).map((sector) => (
                          <span
                            className="strategy-library-chip strategy-library-chip-neutral"
                            key={`${experiment.id}-${sector}`}
                          >
                            {sector}
                          </span>
                        ))}
                        <span className="strategy-library-chip strategy-library-chip-outline">
                          {scope.instrumentTypes[0] || "Any instrument"}
                        </span>
                      </div>
                      <span className="strategy-library-scope-summary">{scope.summary}</span>
                    </div>

                    <div className="strategy-library-evidence">
                      <span className="eyebrow">Validated contexts</span>
                      {validatedContexts.length > 0 ? (
                        <div className="strategy-library-context-list">
                          {validatedContexts.map((context) => (
                            <span
                              className="strategy-library-context-pill"
                              key={`${experiment.id}-${context.sector}-${context.regime}`}
                            >
                              <span aria-hidden="true">•</span>
                              {shortenLabel(context.sector)} + {shortenLabel(context.regime)}
                              <b>{context.sampleCount}</b>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="strategy-library-evidence-empty">
                          {status.key === "insufficient"
                            ? getPendingEvidenceReason(experiment, lifecycle)
                            : "No evidence-cleared sector × regime context yet."}
                        </p>
                      )}
                    </div>

                    <div className="strategy-library-card-bottom">
                      <dl className="strategy-library-summary">
                        <div>
                          <dt>Latest run</dt>
                          <dd>{latestRun ? formatPercent(latestRun.returnPct, 2) : "Not tested"}</dd>
                        </div>
                        <div>
                          <dt>Sharpe</dt>
                          <dd>{latestRun ? Number(latestRun.sharpe || 0).toFixed(2) : "Not available"}</dd>
                        </div>
                        <div>
                          <dt>Validation</dt>
                          <dd>{formatPercent(lifecycle?.realizedPerformance?.hitRate, 1)}</dd>
                        </div>
                        <div>
                          <dt>Membership</dt>
                          <dd>
                            {membershipEntry?.activeContexts
                              ? `${membershipEntry.activeContexts} routed`
                              : membershipEntry?.pendingContexts
                                ? `${membershipEntry.pendingContexts} pending`
                                : "Not routed"}
                          </dd>
                        </div>
                      </dl>

                      <div className="strategy-library-actions">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedExperimentId(experiment.id);
                            setSelectedRunId(experiment.runs?.[0]?.id || "");
                          }}
                          type="button"
                        >
                          <span aria-hidden="true">◌</span> View
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(experiment);
                          }}
                          type="button"
                        >
                          <span aria-hidden="true">✎</span> Edit
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onDuplicate(experiment);
                          }}
                          type="button"
                        >
                          <span aria-hidden="true">⧉</span> Duplicate
                        </button>
                        <button
                          className={status.key === "active" ? "active-action" : ""}
                        disabled={Boolean(disabledReason)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!disabledReason) {
                            openRoutingManager(experiment.id);
                          }
                          }}
                          title={disabledReason || ""}
                          type="button"
                        >
                          {membershipEntry?.activeContexts ? (
                            <>
                              <span aria-hidden="true">◫</span> Manage Routing
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true">+</span> Add to Active Set
                            </>
                          )}
                        </button>
                        <button
                          className="strategy-library-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(experiment.id);
                          }}
                          type="button"
                        >
                          <span aria-hidden="true">×</span> Delete
                        </button>
                      </div>
                    </div>

                    {isRoutingOpen && (
                      <section
                        className="strategy-library-routing-manager"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="strategy-library-routing-header">
                          <div>
                            <p className="eyebrow">Scoped Routing</p>
                            <h3>{experiment.name}</h3>
                          </div>
                          <span>
                            {selectedRoutingMembership?.activeContexts || 0} active ·{" "}
                            {selectedRoutingMembership?.pendingContexts || 0} pending
                          </span>
                        </div>

                        {getEnvelopeContexts(experiment, lifecycle).length > 0 ? (
                          <>
                            <div className="strategy-library-routing-grid">
                              {getEnvelopeContexts(experiment, lifecycle).map((context) => {
                                const contextKey = normalizeContextKey(context);
                                const assigned = assignedContextKeySet.has(contextKey);
                                const selected = selectedContextKeys.includes(contextKey);
                                const currentCell = activeSet.cellsByKey.get(contextKey) || null;
                                const currentRouteName =
                                  currentCell?.strategyName ||
                                  strategiesByExperimentId.get(currentCell?.experimentId)?.name ||
                                  null;
                                const replacingAnotherStrategy =
                                  Boolean(currentCell?.experimentId) &&
                                  currentCell.experimentId !== experiment.id &&
                                  String(currentCell.status || "").toUpperCase() !== "SIT_OUT";
                                return (
                                  <button
                                    className={`strategy-library-routing-chip ${
                                      assigned
                                        ? "assigned"
                                        : replacingAnotherStrategy
                                          ? "occupied"
                                          : selected
                                            ? "selected"
                                            : ""
                                    }`}
                                    key={contextKey}
                                    onClick={() => toggleContext(contextKey)}
                                    type="button"
                                  >
                                    <strong>
                                      {shortenLabel(context.sector)} + {shortenLabel(context.regime)}
                                    </strong>
                                    <span>
                                      {context.evidenceReady
                                        ? `${context.sampleCount} trades · ${formatPercent(context.hitRate, 1)}`
                                        : context.sampleCount > 0
                                          ? `${context.sampleCount} trades · pending evidence`
                                          : "No matured evidence yet"}
                                    </span>
                                    <span className="strategy-library-routing-current">
                                      {assigned
                                        ? "Currently routed here"
                                        : currentRouteName
                                          ? `Current route: ${currentRouteName}`
                                          : "Current route: Sit out"}
                                    </span>
                                    {selected && replacingAnotherStrategy && (
                                      <span className="strategy-library-routing-replace">
                                        Will replace {currentRouteName}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="strategy-library-routing-actions">
                              <button
                                disabled={
                                  !selectedContextKeys.some((key) => !assignedContextKeySet.has(key)) ||
                                  routingActionLoading === experiment.id
                                }
                                onClick={async () => {
                                  const contexts = getEnvelopeContexts(experiment, lifecycle)
                                    .filter((context) =>
                                      selectedContextKeys.includes(normalizeContextKey(context))
                                    )
                                    .filter(
                                      (context) =>
                                        !assignedContextKeySet.has(normalizeContextKey(context))
                                    )
                                    .map((context) => ({
                                      sector: context.sector,
                                      regime: context.regime,
                                    }));
                                  const result = await onAssignToActiveSet(experiment.id, contexts);
                                  if (result) {
                                    setSelectedContextKeys([]);
                                    setRoutingFeedback({
                                      type: "success",
                                      message: `${contexts.length} routing ${contexts.length === 1 ? "cell" : "cells"} saved. The allocation matrix now uses ${experiment.name}.`,
                                    });
                                  } else {
                                    setRoutingFeedback({
                                      type: "error",
                                      message: "The routing change was not saved. Check the Strategy Lab error message and try again.",
                                    });
                                  }
                                }}
                                type="button"
                              >
                                {routingActionLoading === experiment.id
                                  ? "Saving routing..."
                                  : "Assign / replace selected contexts"}
                              </button>
                              <button
                                disabled={
                                  !selectedContextKeys.some((key) => assignedContextKeySet.has(key)) ||
                                  routingActionLoading === experiment.id
                                }
                                onClick={async () => {
                                  const contexts = getEnvelopeContexts(experiment, lifecycle)
                                    .filter((context) =>
                                      selectedContextKeys.includes(normalizeContextKey(context))
                                    )
                                    .filter((context) => assignedContextKeySet.has(normalizeContextKey(context)))
                                    .map((context) => ({
                                      sector: context.sector,
                                      regime: context.regime,
                                    }));
                                  const result = await onRemoveFromActiveSet(experiment.id, contexts);
                                  if (result) {
                                    setSelectedContextKeys([]);
                                    setRoutingFeedback({
                                      type: "success",
                                      message: `${contexts.length} routing ${contexts.length === 1 ? "cell" : "cells"} removed and saved.`,
                                    });
                                  } else {
                                    setRoutingFeedback({
                                      type: "error",
                                      message: "The routing removal was not saved. Check the Strategy Lab error message and try again.",
                                    });
                                  }
                                }}
                                type="button"
                              >
                                {routingActionLoading === experiment.id
                                  ? "Saving routing..."
                                  : "Remove selected contexts"}
                              </button>
                              <button
                                className="strategy-library-routing-close"
                                onClick={() => openRoutingManager(experiment.id)}
                                type="button"
                              >
                                Close
                              </button>
                            </div>
                            {routingFeedback && (
                              <p
                                className={`strategy-library-routing-feedback ${routingFeedback.type}`}
                                role={routingFeedback.type === "error" ? "alert" : "status"}
                              >
                                {routingFeedback.message}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="strategy-library-evidence-empty">
                            This strategy does not have any sector × regime contexts that have
                            cleared the validation gate yet.
                          </p>
                        )}
                      </section>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="alerts-empty">No experiments yet.</p>
          )}
        </article>

        <article className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Audit Trail</p>
              <h2>Version & promotion history</h2>
            </div>
          </div>
          <div className="approval-audit-list">
            {(selectedExperiment?.runs || []).slice(0, 4).map((run) => (
              <article key={run.id}>
                <span>Backtest run</span>
                <strong>{new Date(run.createdAt).toLocaleString()}</strong>
                <p>
                  Return {Number(run.returnPct || 0).toFixed(2)}%, Sharpe{" "}
                  {Number(run.sharpe || 0).toFixed(2)}, Drawdown{" "}
                  {Number(run.maxDrawdown || 0).toFixed(2)}%.
                </p>
              </article>
            ))}
            {selectedExperiment?.id === activeStrategyExperimentId && (
              <article>
                <span>Routing owner</span>
                <strong>{selectedExperiment.name}</strong>
                <p>
                  This strategy currently owns the live sector × regime allocation matrix that the
                  scanner routes through.
                </p>
              </article>
            )}
            {!selectedExperiment && (
              <p className="alerts-empty">Select a strategy to view audit history.</p>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
