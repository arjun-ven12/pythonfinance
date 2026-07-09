function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "Not available";
}

function formatSample(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function StrategyConditioningPanel({
  lifecycle,
  selectedExperiment,
  selectedRun,
}) {
  const strategyLifecycle =
    lifecycle?.strategies?.find((item) => item.experimentId === selectedExperiment?.id) || null;
  const executable =
    selectedExperiment?.versions?.[0]?.strategyJson?.executable ||
    selectedExperiment?.settingsJson?.strategyJson?.executable ||
    {};
  const envelope = executable.envelope || strategyLifecycle?.envelope || {};
  const overlays = executable.regimeOverlays || {};
  const matrix = strategyLifecycle?.allocationMatrixEvidence || { sectors: [], regimes: [], cells: [] };
  const regimeBreakdown =
    selectedRun?.settingsJson?.regime_breakdown ||
    strategyLifecycle?.realizedPerformance?.byRegime ||
    [];

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Conditioning & Routing</p>
          <h2>Where the strategy is allowed to act</h2>
        </div>
        <span>{selectedExperiment?.name || "Select a strategy"}</span>
      </div>

      <div className="strategy-conditioning-grid">
        <article className="strategy-conditioning-block">
          <span>Allowed sectors</span>
          <div className="strategy-design-note-list">
            {(envelope.sectors || []).length > 0
              ? envelope.sectors.map((sector) => <span key={sector}>{sector}</span>)
              : <span>All sectors</span>}
          </div>
        </article>
        <article className="strategy-conditioning-block">
          <span>Allowed regimes</span>
          <div className="strategy-design-note-list">
            {(envelope.regimes || []).length > 0
              ? envelope.regimes.map((regime) => <span key={regime}>{regime}</span>)
              : <span>All regimes</span>}
          </div>
        </article>
        <article className="strategy-conditioning-block">
          <span>Instrument types</span>
          <div className="strategy-design-note-list">
            {(envelope.instrumentTypes || []).length > 0
              ? envelope.instrumentTypes.map((instrumentType) => (
                  <span key={instrumentType}>{instrumentType}</span>
                ))
              : <span>All instruments</span>}
          </div>
        </article>
        <article className="strategy-conditioning-block">
          <span>Envelope guards</span>
          <strong>
            Vol {formatPercent((envelope.volBand?.min || 0) * 100)} -{" "}
            {formatPercent((envelope.volBand?.max || 0) * 100)}
          </strong>
          <small>
            Liquidity floor {formatSample(envelope.liquidityFloor).toLocaleString()} · Max hold{" "}
            {formatSample(envelope.holdingPeriodDays)}d
          </small>
        </article>
      </div>

      <div className="strategy-conditioning-overlay-list">
        <div>
          <span>Regime overlays</span>
          <strong>{Object.keys(overlays).length} configured</strong>
        </div>
        {Object.keys(overlays).length > 0 ? (
          <div className="strategy-design-note-list">
            {Object.entries(overlays).map(([regime, config]) => (
              <span key={regime}>
                {regime}: {Object.keys(config || {}).join(", ") || "override"}
              </span>
            ))}
          </div>
        ) : (
          <p className="alerts-empty">
            No regime-specific parameter overrides yet. Base parameters run across every allowed regime.
          </p>
        )}
      </div>

      <div className="strategy-conditioning-overlay-list">
        <div>
          <span>Per-regime evidence</span>
          <strong>{regimeBreakdown.length} regimes measured</strong>
        </div>
        {regimeBreakdown.length > 0 ? (
          <div className="strategy-regime-heatmap">
            {regimeBreakdown.map((row) => (
              <article key={row.regime}>
                <span>{row.regime}</span>
                <strong>{formatPercent(row.winRate)}</strong>
                <p>Return {formatPercent(row.realizedReturn ?? row.averageReturn)}</p>
                <small>{formatSample(row.sampleCount ?? row.tradeCount)} samples</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="alerts-empty">
            Per-regime evidence appears after validation outcomes mature or trades persist with regime context.
          </p>
        )}
      </div>

      <div className="strategy-conditioning-overlay-list">
        <div>
          <span>Sector x regime allocation matrix</span>
          <strong>
            {matrix.cells?.length || 0} cells · inactive cells are blocked until evidence clears
          </strong>
        </div>
        {matrix.cells?.length > 0 ? (
          <div className="strategy-matrix-grid">
            {matrix.cells.map((cell) => (
              <article
                className={cell.active ? "active" : "inactive"}
                key={cell.key}
              >
                <span>{cell.sector}</span>
                <strong>{cell.regime}</strong>
                <p>{cell.strategyName || "No assigned strategy"}</p>
                <small>
                  {formatSample(cell.sampleCount)} samples · {formatPercent(cell.hitRate)}
                </small>
                <em>{cell.active ? "Active" : cell.inactiveReason || "insufficient evidence"}</em>
              </article>
            ))}
          </div>
        ) : (
          <p className="alerts-empty">
            Add JSON assignments in the builder to route sectors and regimes to existing validated strategies.
          </p>
        )}
      </div>
    </section>
  );
}
