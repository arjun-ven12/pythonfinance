export default function ScannerFilterDrawer({
  CURRENCY_FILTERS,
  EXCHANGE_FILTERS,
  MARKET_FILTERS,
  activeChips,
  drawdownThreshold,
  isOpen,
  onClose,
  onLoadSavedView,
  onSaveCurrentView,
  onToggleQuickFilter,
  quickFilters,
  savedViews,
  scanWatchlistOnly,
  scannerCurrencyFilter,
  scannerExchangeFilter,
  scannerMarketFilter,
  scoreThreshold,
  setDrawdownThreshold,
  setScanWatchlistOnly,
  setScannerCurrencyFilter,
  setScannerExchangeFilter,
  setScannerMarketFilter,
  setScoreThreshold,
}) {
  if (!isOpen) return null;

  return (
    <div className="scanner-filter-drawer-shell" role="presentation">
      <button
        aria-label="Close filters"
        className="scanner-filter-drawer-backdrop"
        onClick={onClose}
        type="button"
      />

      <aside className="scanner-filter-drawer" aria-label="Scanner filters">
        <div className="scanner-filter-drawer-header">
          <div>
            <p className="eyebrow">Filter drawer</p>
            <h3>Refine the queue</h3>
          </div>
          <button className="scanner-filter-close" onClick={onClose} type="button">
            Done
          </button>
        </div>

        <section className="scanner-filter-drawer-section">
          <div className="scanner-filter-section-header">
            <div>
              <p className="eyebrow">Active filters</p>
              <strong>{activeChips.length ? `${activeChips.length} applied` : "No filters applied"}</strong>
            </div>
            <button className="scanner-text-button" onClick={onSaveCurrentView} type="button">
              Save current view
            </button>
          </div>

          <div className="scanner-active-filter-row">
            {activeChips.length ? (
              activeChips.map((chip) => (
                <button
                  className="scanner-active-filter-chip"
                  key={chip.key}
                  onClick={chip.onRemove}
                  type="button"
                >
                  {chip.label} <span aria-hidden="true">x</span>
                </button>
              ))
            ) : (
              <span className="scanner-muted-copy">Everything is visible right now.</span>
            )}
          </div>
        </section>

        <section className="scanner-filter-drawer-section">
          <div className="scanner-filter-section-header">
            <div>
              <p className="eyebrow">Saved views</p>
              <strong>Quick switch</strong>
            </div>
          </div>
          <div className="scanner-saved-view-row">
            {savedViews.length ? (
              savedViews.map((view) => (
                <button
                  className="scanner-saved-view-chip"
                  key={view.id}
                  onClick={() => onLoadSavedView(view)}
                  type="button"
                >
                  {view.name}
                </button>
              ))
            ) : (
              <span className="scanner-muted-copy">No saved views yet.</span>
            )}
          </div>
        </section>

        <section className="scanner-filter-drawer-section">
          <div className="scanner-filter-section-header">
            <div>
              <p className="eyebrow">Market</p>
              <strong>Scope and venue</strong>
            </div>
          </div>

          <div className="scanner-filter-grid">
            <label className="scanner-market-field">
              <span>Market</span>
              <select
                onChange={(event) => setScannerMarketFilter(event.target.value)}
                value={scannerMarketFilter}
              >
                {MARKET_FILTERS.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </select>
            </label>

            <label className="scanner-market-field">
              <span>Exchange</span>
              <select
                onChange={(event) => setScannerExchangeFilter(event.target.value)}
                value={scannerExchangeFilter}
              >
                {EXCHANGE_FILTERS.map((exchange) => (
                  <option key={exchange} value={exchange}>
                    {exchange}
                  </option>
                ))}
              </select>
            </label>

            <label className="scanner-market-field">
              <span>Currency</span>
              <select
                onChange={(event) => setScannerCurrencyFilter(event.target.value)}
                value={scannerCurrencyFilter}
              >
                {CURRENCY_FILTERS.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="scanner-filter-drawer-section">
          <div className="scanner-filter-section-header">
            <div>
              <p className="eyebrow">Quality</p>
              <strong>Conviction and downside</strong>
            </div>
          </div>

          <div className="scanner-threshold-grid">
            <label className="scanner-threshold-control">
              <span>Score threshold</span>
              <input
                min="0"
                max="100"
                onChange={(event) => setScoreThreshold(event.target.value)}
                type="number"
                value={scoreThreshold}
              />
            </label>
            <label className="scanner-threshold-control">
              <span>Drawdown threshold</span>
              <input
                min="0"
                max="100"
                onChange={(event) => setDrawdownThreshold(event.target.value)}
                type="number"
                value={drawdownThreshold}
              />
            </label>
          </div>
        </section>

        <section className="scanner-filter-drawer-section">
          <div className="scanner-filter-section-header">
            <div>
              <p className="eyebrow">Strategy</p>
              <strong>Signal quality toggles</strong>
            </div>
          </div>
          <div className="scanner-chip-row">
            <button
              className={`scanner-filter-chip ${quickFilters.buyOnly ? "active" : ""}`}
              onClick={() => onToggleQuickFilter("buyOnly")}
              type="button"
            >
              Buy only
            </button>
            <button
              className={`scanner-filter-chip ${quickFilters.scoreAbove60 ? "active" : ""}`}
              onClick={() => onToggleQuickFilter("scoreAbove60")}
              type="button"
            >
              Score filter
            </button>
            <button
              className={`scanner-filter-chip ${quickFilters.drawdownBelow10 ? "active" : ""}`}
              onClick={() => onToggleQuickFilter("drawdownBelow10")}
              type="button"
            >
              Drawdown filter
            </button>
            <button
              className={`scanner-filter-chip ${quickFilters.beatsBuyHold ? "active" : ""}`}
              onClick={() => onToggleQuickFilter("beatsBuyHold")}
              type="button"
            >
              Beat benchmark
            </button>
            <button
              className={`scanner-filter-chip ${scanWatchlistOnly ? "active" : ""}`}
              onClick={() => setScanWatchlistOnly((current) => !current)}
              type="button"
            >
              Watchlist only
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
