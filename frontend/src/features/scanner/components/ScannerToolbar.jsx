import SignalStatPill from "./SignalStatPill";

export default function ScannerToolbar({
  FILTERS,
  SORT_OPTIONS,
  activeFilterCount,
  counts,
  data,
  filter,
  handleClearScannedStocks,
  handleScanSearchSymbol,
  handleSortChange,
  isScanning,
  isSearchTicker,
  onOpenFilters,
  scannerView,
  search,
  searchExactMatch,
  searchTerm,
  setFilter,
  setScannerView,
  setSearchTerm,
  sortDirection,
  sortKey,
}) {
  const showSearchAction = search && isSearchTicker && !searchExactMatch;

  return (
    <section className="scanner-toolbar scanner-toolbar-v2" aria-label="Scanner controls">
      <div className="scanner-toolbar-primary">
        <div className="scanner-toolbar-search">
          <div className="scanner-search-input-wrap">
            <input
              aria-label="Search scanner opportunities"
              id="symbol-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  isSearchTicker &&
                  !searchExactMatch &&
                  !isScanning
                ) {
                  handleScanSearchSymbol();
                }
              }}
              placeholder="Search symbol, company, sector..."
              type="search"
              value={searchTerm}
            />
          </div>

          {showSearchAction ? (
            <button
              className="scanner-toolbar-button scanner-toolbar-button-primary"
              disabled={isScanning}
              onClick={handleScanSearchSymbol}
              type="button"
            >
              {isScanning ? "Scanning..." : `Scan ${search}`}
            </button>
          ) : null}
        </div>

        <div className="scanner-toolbar-actions">
          <div className="scanner-toolbar-view">
            <button
              className={scannerView === "cards" ? "active" : ""}
              onClick={() => setScannerView("cards")}
              type="button"
            >
              Cards
            </button>
            <button
              className={scannerView === "table" ? "active" : ""}
              onClick={() => setScannerView("table")}
              type="button"
            >
              Table
            </button>
          </div>

          <div className="scanner-toolbar-sort">
            <select
              aria-label="Sort opportunities"
              id="sort-select"
              value={sortKey}
              onChange={(event) => handleSortChange(event.target.value)}
            >
              {[
                ...SORT_OPTIONS,
                { key: "symbol", label: "Symbol" },
                { key: "signal", label: "Signal" },
              ].map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="scanner-sort-direction"
              onClick={() =>
                handleSortChange(sortKey)
              }
              type="button"
            >
              {sortDirection === "desc" ? "High to Low" : "Low to High"}
            </button>
          </div>

          <button
            className="scanner-toolbar-button subtle"
            onClick={onOpenFilters}
            type="button"
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>

          <button
            className="scanner-toolbar-button subtle"
            disabled={!data.opportunities.length}
            onClick={handleClearScannedStocks}
            type="button"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="scanner-toolbar-signals">
        {FILTERS.map((type) => (
          <SignalStatPill
            active={filter === type}
            count={counts[type]}
            key={type}
            onClick={() => setFilter(type)}
            signal={type}
          />
        ))}
      </div>
    </section>
  );
}
