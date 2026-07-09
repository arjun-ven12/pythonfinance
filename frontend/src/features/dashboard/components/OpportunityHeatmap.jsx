function getSectorTone(sector) {
  const totalSignals = sector.counts.BUY + sector.counts.HOLD + sector.counts.SELL;
  const buyShare = totalSignals ? sector.counts.BUY / totalSignals : 0;
  const sellShare = totalSignals ? sector.counts.SELL / totalSignals : 0;
  const heatBias = sector.heatBias ?? buyShare - sellShare;

  if (heatBias > 0.2) {
    return {
      className: "bullish",
      intensity: Math.min(0.88, 0.24 + Math.abs(heatBias) * 0.72),
    };
  }

  if (heatBias < -0.2) {
    return {
      className: "bearish",
      intensity: Math.min(0.88, 0.24 + Math.abs(heatBias) * 0.72),
    };
  }

  return {
    className: "neutral",
    intensity: 0.35,
  };
}

export default function OpportunityHeatmap({
  heatmapMode,
  onModeChange,
  onSelectSector,
  onTimeframeChange,
  sectors,
  selectedSector,
  timeframe,
}) {
  if (!sectors) {
    return (
      <section className="heatmap-panel">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Opportunity Heatmap</p>
            <h2>Loading</h2>
          </div>
        </div>
        <p className="alerts-empty">Building sector heatmap...</p>
      </section>
    );
  }

  if (sectors.length === 0) {
    return (
      <section className="heatmap-panel">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Opportunity Heatmap</p>
            <h2>No sector data</h2>
          </div>
        </div>
        <p className="alerts-empty">
          Run a new scan after sector metadata is available to populate the heatmap.
        </p>
      </section>
    );
  }

  const maxOpportunities = Math.max(
    ...sectors.map((sector) => sector.totalOpportunities),
    1
  );

  return (
    <section className="heatmap-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Opportunity Heatmap</p>
          <h2>{sectors.length} sectors</h2>
        </div>
        {selectedSector && (
          <button
            className="direction-toggle"
            onClick={() => onSelectSector("")}
            type="button"
          >
            Clear sector filter
          </button>
        )}
      </div>

      <div className="heatmap-controls">
        <div className="chart-timeframes">
          {[
            ["today", "Today"],
            ["24h", "Last 24h"],
            ["week", "Last week"],
          ].map(([value, label]) => (
            <button
              className={timeframe === value ? "active" : ""}
              key={value}
              onClick={() => onTimeframeChange(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="compact-toggle">
          <input
            checked={heatmapMode === "confidence"}
            onChange={(event) =>
              onModeChange(event.target.checked ? "confidence" : "signals")
            }
            type="checkbox"
          />
          Confidence-weighted
        </label>
      </div>

      <div className="heatmap-grid">
        {sectors.map((sector) => {
          const tone = getSectorTone(sector);
          const scale =
            0.9 + (sector.totalOpportunities / maxOpportunities) * 0.35;

          return (
            <button
              aria-label={`Filter scanner to ${sector.sector}`}
              className={`heatmap-card ${tone.className} ${
                selectedSector === sector.sector ? "selected" : ""
              }`}
              disabled={!sector.canFilter}
              key={sector.sector}
              onClick={() => onSelectSector(sector.sector)}
              style={{
                "--heat-intensity": tone.intensity,
                "--heat-scale": scale,
              }}
              title={
                sector.canFilter
                  ? `${sector.sector}: avg score ${sector.averageScore}, BUY/HOLD/SELL ${sector.counts.BUY}/${sector.counts.HOLD}/${sector.counts.SELL}`
                  : "Sector metadata is not available for this scan. Run a fresh scan to populate real sectors."
              }
              type="button"
            >
              <div className="heatmap-card-header">
                <div>
                  <strong>{sector.sector}</strong>
                  <div className="heatmap-badges">
                    {sector.isWatchlistSector && <span>Watchlist</span>}
                    {sector.isRegimeFavored && <span>Regime favored</span>}
                  </div>
                </div>
                <span>{sector.totalOpportunities}</span>
              </div>
              <dl>
                <div>
                  <dt>Avg score</dt>
                  <dd>{sector.averageScore}</dd>
                </div>
                <div>
                  <dt>Avg conf.</dt>
                  <dd>{sector.averageConfidence}</dd>
                </div>
                <div>
                  <dt>Signals</dt>
                  <dd>
                    {sector.counts.BUY}/{sector.counts.HOLD}/{sector.counts.SELL}
                  </dd>
                </div>
                <div>
                  <dt>US / SG</dt>
                  <dd>
                    {sector.marketSplit?.US || 0}/{sector.marketSplit?.Singapore || 0}
                  </dd>
                </div>
                <div>
                  <dt>Momentum</dt>
                  <dd className={sector.momentumClass}>
                    {sector.momentumArrow} {sector.momentumDelta}
                  </dd>
                </div>
              </dl>
              <div className="heatmap-symbols">
                {sector.topSymbols.map((symbol) => (
                  <span key={symbol}>{symbol}</span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
