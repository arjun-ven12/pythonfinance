import { useMemo, useState } from "react";
import StockWorkspaceModal from "../../components/stocks/StockWorkspaceModal";
import WatchlistItem from "./components/WatchlistItem";
import useTradingWorkspace from "./hooks/useTradingWorkspace";
import useWatchlistQuotes from "./hooks/useWatchlistQuotes";

export default function WatchlistFeaturePage({
  formatPercent,
  isScanning,
  onScanWatchlist,
  scanWatchlistOnly,
  setScanWatchlistOnly,
  setSelectedSymbol,
  toggleWatchlist,
  watchlistError,
  watchlistItems,
  watchlistSource,
  watchlistSymbols,
}) {
  const [selectedWatchlistSymbol, setSelectedWatchlistSymbol] = useState("");
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const { getQuoteForEntry, flashBySymbol } = useWatchlistQuotes(watchlistItems);
  const selectedWatchlistEntry = useMemo(
    () =>
      watchlistItems.find(({ symbol }) => symbol === selectedWatchlistSymbol) ||
      watchlistItems[0] ||
      null,
    [selectedWatchlistSymbol, watchlistItems]
  );
  const selectedLiveQuote = selectedWatchlistEntry ? getQuoteForEntry(selectedWatchlistEntry) : null;
  const workspace = useTradingWorkspace(
    selectedWatchlistEntry?.item?.yahoo_symbol ||
      selectedWatchlistEntry?.item?.yahooSymbol ||
      selectedWatchlistEntry?.item?.display_symbol ||
      selectedWatchlistEntry?.item?.symbol ||
      selectedWatchlistEntry?.symbol ||
      "",
    selectedLiveQuote,
    {
      lastClose: selectedWatchlistEntry?.item?.close,
      market: selectedWatchlistEntry?.item?.market,
    }
  );
  const scannedWatchlistItems = useMemo(
    () => watchlistItems.filter(({ item }) => Boolean(item)),
    [watchlistItems]
  );
  const unscannedWatchlistItems = useMemo(
    () => watchlistItems.filter(({ item }) => !item),
    [watchlistItems]
  );
  const watchlistCounts = useMemo(
    () => ({
      ALL: watchlistSymbols.length,
      BUY: scannedWatchlistItems.filter(({ item }) => item?.signal === "BUY").length,
      HOLD: scannedWatchlistItems.filter(({ item }) => item?.signal === "HOLD").length,
      SELL: scannedWatchlistItems.filter(({ item }) => item?.signal === "SELL").length,
      UNSCANNED: unscannedWatchlistItems.length,
    }),
    [scannedWatchlistItems, unscannedWatchlistItems, watchlistSymbols.length]
  );

  const handleSelectSymbol = (symbol, item) => {
    setSelectedWatchlistSymbol(symbol);
    if (item) {
      setSelectedSymbol(symbol);
    }
    setIsWorkspaceOpen(true);
  };

  const handleViewSymbol = (symbol, item) => {
    handleSelectSymbol(symbol, item);
  };

  const handleScanWatchlist = () => {
    if (isScanning || watchlistSymbols.length === 0) return;
    setScanWatchlistOnly(true);
    onScanWatchlist?.();
  };

  const filteredScannedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const base =
      activeFilter === "ALL" || activeFilter === "UNSCANNED"
        ? scannedWatchlistItems
        : scannedWatchlistItems.filter(({ item }) => item?.signal === activeFilter);

    if (!normalizedQuery) {
      return base;
    }

    return base.filter(({ symbol, item }) => {
      const haystack = [
        symbol,
        item?.display_symbol,
        item?.company_name,
        item?.companyName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeFilter, scannedWatchlistItems, searchQuery]);

  const showUnscannedSection = activeFilter === "ALL" || activeFilter === "UNSCANNED";

  return (
    <section className="alerts-panel watchlist-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Watchlist</p>
          <h2>{watchlistSymbols.length} symbols</h2>
        </div>
        <span>
          Saved in {watchlistSource === "database" ? "PostgreSQL" : "localStorage fallback"}
        </span>
      </div>

      {watchlistError && <p className="engine-error">{watchlistError}</p>}

      <div className="watchlist-command-bar">
        <div className="watchlist-filter-tabs" aria-label="Watchlist signal filters">
          {[
            ["ALL", "All"],
            ["BUY", "Buy"],
            ["HOLD", "Hold"],
            ["SELL", "Sell"],
            ["UNSCANNED", "Unscanned"],
          ].map(([value, label]) => (
            <button
              className={activeFilter === value ? "active" : ""}
              key={value}
              onClick={() => setActiveFilter(value)}
              type="button"
            >
              <span>{label}</span>
              <b>{watchlistCounts[value]}</b>
            </button>
          ))}
        </div>

        <button
          aria-busy={isScanning}
          className={`watchlist-scan-toggle ${scanWatchlistOnly || isScanning ? "active" : ""}`}
          disabled={isScanning || watchlistSymbols.length === 0}
          onClick={handleScanWatchlist}
          type="button"
        >
          {isScanning ? "Scanning watchlist..." : "Scan watchlist only"}
        </button>

        <label className="watchlist-search">
          <span>Search</span>
          <input
            placeholder="Ticker or company name"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>

      {watchlistItems.length > 0 ? (
        <div className="watchlist-layout">
          <div className="watchlist-terminal-surface">
            <div className="watchlist-list-header">
              <span>Signal</span>
              <span>Symbol</span>
              <span>Last</span>
              <span>Change</span>
              <span>Volume</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            <div className="watchlist-list">
              {filteredScannedItems.map(({ symbol, item }) => (
                <WatchlistItem
                  formatPercent={formatPercent}
                  flashDirection={
                    flashBySymbol[
                      item?.yahoo_symbol || item?.yahooSymbol || item?.display_symbol || item?.symbol || symbol
                    ]
                  }
                  isSelected={selectedWatchlistEntry?.symbol === symbol}
                  item={item}
                  key={symbol}
                  onRemove={() => toggleWatchlist(symbol)}
                  onSelect={() => handleSelectSymbol(symbol, item)}
                  onView={() => handleViewSymbol(symbol, item)}
                  quote={getQuoteForEntry({ symbol, item })}
                  symbol={symbol}
                />
              ))}

              {showUnscannedSection && unscannedWatchlistItems.length > 0 ? (
                <>
                  <div className="watchlist-pending-heading">
                    <strong>Pending scan coverage</strong>
                    <span>{unscannedWatchlistItems.length} without latest scan data</span>
                  </div>
                  {unscannedWatchlistItems.map(({ symbol, item }) => (
                    <WatchlistItem
                      formatPercent={formatPercent}
                      flashDirection={flashBySymbol[symbol]}
                      isSelected={selectedWatchlistEntry?.symbol === symbol}
                      item={item}
                      key={symbol}
                      onRemove={() => toggleWatchlist(symbol)}
                      onSelect={() => handleSelectSymbol(symbol, item)}
                      onView={() => handleViewSymbol(symbol, item)}
                      quote={getQuoteForEntry({ symbol, item })}
                      symbol={symbol}
                    />
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="alerts-empty">
          No symbols in your watchlist yet. Add symbols from Scanner cards or
          the selected-stock panel.
        </p>
      )}

      <StockWorkspaceModal
        footerNote={
          selectedWatchlistEntry?.item?.portfolio_fit?.explanation ||
          "Watchlist symbols open into the same broker-backed workspace so you can review price action, news, confidence, and paper routing in one place."
        }
        isOpen={isWorkspaceOpen}
        liveQuote={selectedLiveQuote}
        onClose={() => setIsWorkspaceOpen(false)}
        onToggleWatchlist={toggleWatchlist}
        selected={selectedWatchlistEntry}
        watchlist={new Set(watchlistSymbols)}
        workspace={workspace}
      />
    </section>
  );
}
