import { useEffect, useMemo, useState } from "react";
import OpportunityTable from "../../components/scanner/OpportunityTable";
import { API_BASE_URL, apiFetch as fetch, readJson } from "../../services/apiClient";
import ScannerFilterDrawer from "./components/ScannerFilterDrawer";
import ScannerInspector from "./components/ScannerInspector";
import ScannerOpportunityQueue from "./components/ScannerOpportunityQueue";
import { buildActiveScannerChips } from "./scannerFilterChips";
import { loadSavedScannerViews, persistSavedScannerViews } from "./scannerSavedViews";
import ScannerToolbar from "./components/ScannerToolbar";

function classifyOpportunity(item, scoreThreshold) {
  const signal = String(item.signal || "HOLD").toUpperCase();
  const confidence = Number(item.confidence || 0);
  const score = Number(item.opportunity_score || 0);
  const riskLevel = String(
    item.openai_news_reasoning?.risk_level ||
      item.pre_trade_analysis?.risk_level ||
      "MEDIUM"
  ).toUpperCase();
  const portfolioRecommendation = String(
    item.portfolio_fit?.recommendation || "WAIT"
  ).toUpperCase();

  if (signal === "SELL") {
    return "ARCHIVED";
  }

  if (
    riskLevel === "HIGH" ||
    ["WAIT", "REJECT", "REDUCE_SIZE"].includes(portfolioRecommendation)
  ) {
    return "AVOID";
  }

  if (signal === "BUY" && confidence >= 80 && score >= Number(scoreThreshold || 60)) {
    return "NOW";
  }

  return "WATCH";
}

function buildGroups(items, scoreThreshold) {
  const labels = {
    NOW: {
      label: "Now",
      description: "High-conviction candidates worth immediate inspection.",
    },
    WATCH: {
      label: "Watch",
      description: "Promising names that still need confirmation.",
    },
    AVOID: {
      label: "Avoid",
      description: "Risk, event, or fit issues are blocking deployment.",
    },
    ARCHIVED: {
      label: "Archived",
      description: "Signals that have rolled over or moved to sell.",
    },
  };

  return Object.entries(labels)
    .map(([key, meta]) => ({
      key,
      ...meta,
      items: items.filter((item) => classifyOpportunity(item, scoreThreshold) === key),
    }))
    .filter((group) => group.items.length);
}

export default function ScannerPage({
  scanner,
  CURRENCY_FILTERS,
  EXCHANGE_FILTERS,
  FILTERS,
  MARKET_FILTERS,
  SORT_OPTIONS,
  activeHorizonProfile,
  activeStrategy,
  data,
  drawdownThreshold,
  formatPercent,
  isScanning,
  scanWatchlistOnly,
  scoreThreshold,
  selectedStock,
  setDetailSymbol,
  setDrawdownThreshold,
  setScanWatchlistOnly,
  setScoreThreshold,
  setSelectedSymbol,
  toggleWatchlist,
  watchlist,
}) {
  const {
    counts,
    displayed,
    filter,
    handleClearScannedStocks,
    handleScanSearchSymbol,
    handleSortChange,
    isSearchTicker,
    quickFilters,
    scannerCurrencyFilter,
    scannerExchangeFilter,
    scannerMarketFilter,
    scannerView,
    search,
    searchExactMatch,
    searchTerm,
    setFilter,
    setQuickFilters,
    setScannerCurrencyFilter,
    setScannerExchangeFilter,
    setScannerMarketFilter,
    setScannerView,
    setSearchTerm,
    setSortKey,
    setSortDirection,
    sortDirection,
    sortKey,
    sorted,
    toggleQuickFilter,
  } = scanner;

  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [savedViews, setSavedViews] = useState(() => loadSavedScannerViews());
  const [compareSelection, setCompareSelection] = useState([]);
  const [historyBySymbol, setHistoryBySymbol] = useState({});

  const groups = useMemo(
    () => buildGroups(displayed, scoreThreshold),
    [displayed, scoreThreshold]
  );

  const compareItems = useMemo(
    () =>
      compareSelection
        .map((symbol) => displayed.find((item) => item.symbol === symbol))
        .filter(Boolean),
    [compareSelection, displayed]
  );

  const activeChips = useMemo(
    () =>
      buildActiveScannerChips({
        drawdownThreshold,
        quickFilters,
        scanWatchlistOnly,
        scannerCurrencyFilter,
        scannerExchangeFilter,
        scannerMarketFilter,
        scoreThreshold,
        setDrawdownThreshold,
        setQuickFilters,
        setScanWatchlistOnly,
        setScannerCurrencyFilter,
        setScannerExchangeFilter,
        setScannerMarketFilter,
        setScoreThreshold,
      }),
    [
      drawdownThreshold,
      quickFilters,
      scanWatchlistOnly,
      scannerCurrencyFilter,
      scannerExchangeFilter,
      scannerMarketFilter,
      scoreThreshold,
      setDrawdownThreshold,
      setQuickFilters,
      setScanWatchlistOnly,
      setScannerCurrencyFilter,
      setScannerExchangeFilter,
      setScannerMarketFilter,
      setScoreThreshold,
    ]
  );

  useEffect(() => {
    if (!selectedStock?.symbol) return;
    if (historyBySymbol[selectedStock.symbol]) return;

    const controller = new AbortController();

    fetch(`${API_BASE_URL}/api/opportunity-history/${encodeURIComponent(selectedStock.symbol)}`, {
      signal: controller.signal,
    })
      .then(readJson)
      .then((payload) => {
        setHistoryBySymbol((current) => ({
          ...current,
          [selectedStock.symbol]: payload.history || [],
        }));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [historyBySymbol, selectedStock?.symbol]);

  const handleLoadSavedView = (view) => {
    setFilter(view.filter || "ALL");
    setSortKey(view.sortKey || "opportunity_score");
    setSortDirection(view.sortDirection || "desc");
    setScannerView(view.scannerView || "cards");
    setScannerMarketFilter(view.scannerMarketFilter || "ALL");
    setScannerExchangeFilter(view.scannerExchangeFilter || "ALL");
    setScannerCurrencyFilter(view.scannerCurrencyFilter || "ALL");
    setQuickFilters(view.quickFilters || {
      buyOnly: false,
      scoreAbove60: false,
      drawdownBelow10: false,
      beatsBuyHold: false,
    });
    setScoreThreshold(view.scoreThreshold || "60");
    setDrawdownThreshold(view.drawdownThreshold || "10");
    setScanWatchlistOnly(Boolean(view.scanWatchlistOnly));
    setIsFilterDrawerOpen(false);
  };

  const handleSaveCurrentView = () => {
    const name = window.prompt("Name this scanner view:");
    if (!name) return;

    const nextViews = [
      {
        id: `${Date.now()}`,
        name,
        filter,
        sortKey,
        sortDirection,
        scannerView,
        scannerMarketFilter,
        scannerExchangeFilter,
        scannerCurrencyFilter,
        quickFilters,
        scoreThreshold,
        drawdownThreshold,
        scanWatchlistOnly,
      },
      ...savedViews,
    ];

    setSavedViews(nextViews);
    persistSavedScannerViews(nextViews);
  };

  const handleInspect = (symbol) => {
    setSelectedSymbol(symbol);
    setIsWorkspaceOpen(true);
  };

  const handleToggleCompare = (symbol) => {
    setCompareSelection((current) => {
      if (current.includes(symbol)) {
        return current.filter((entry) => entry !== symbol);
      }

      if (current.length >= 4) {
        return [...current.slice(1), symbol];
      }

      return [...current, symbol];
    });
  };

  return (
    <div className="scanner-page scanner-feature-page scanner-workspace">
      <div className="scanner-controls-stack">
        <ScannerToolbar
          FILTERS={FILTERS}
          SORT_OPTIONS={SORT_OPTIONS}
          activeFilterCount={activeChips.length}
          counts={counts}
          data={data}
          filter={filter}
          handleClearScannedStocks={handleClearScannedStocks}
          handleScanSearchSymbol={handleScanSearchSymbol}
          handleSortChange={handleSortChange}
          isScanning={isScanning}
          isSearchTicker={isSearchTicker}
          onOpenFilters={() => setIsFilterDrawerOpen(true)}
          scannerView={scannerView}
          search={search}
          searchExactMatch={searchExactMatch}
          searchTerm={searchTerm}
          setFilter={setFilter}
          setScannerView={setScannerView}
          setSearchTerm={setSearchTerm}
          sortDirection={sortDirection}
          sortKey={sortKey}
        />

        {activeChips.length ? (
          <div className="scanner-active-filter-strip">
            {activeChips.map((chip) => (
              <button
                className="scanner-active-filter-chip"
                key={chip.key}
                onClick={chip.onRemove}
                type="button"
              >
                {chip.label} <span aria-hidden="true">x</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ScannerFilterDrawer
        CURRENCY_FILTERS={CURRENCY_FILTERS}
        EXCHANGE_FILTERS={EXCHANGE_FILTERS}
        MARKET_FILTERS={MARKET_FILTERS}
        activeChips={activeChips}
        drawdownThreshold={drawdownThreshold}
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        onLoadSavedView={handleLoadSavedView}
        onSaveCurrentView={handleSaveCurrentView}
        onToggleQuickFilter={toggleQuickFilter}
        quickFilters={quickFilters}
        savedViews={savedViews}
        scanWatchlistOnly={scanWatchlistOnly}
        scannerCurrencyFilter={scannerCurrencyFilter}
        scannerExchangeFilter={scannerExchangeFilter}
        scannerMarketFilter={scannerMarketFilter}
        scoreThreshold={scoreThreshold}
        setDrawdownThreshold={setDrawdownThreshold}
        setScanWatchlistOnly={setScanWatchlistOnly}
        setScannerCurrencyFilter={setScannerCurrencyFilter}
        setScannerExchangeFilter={setScannerExchangeFilter}
        setScannerMarketFilter={setScannerMarketFilter}
        setScoreThreshold={setScoreThreshold}
      />

      <div className="scanner-results-stage">
        {scannerView === "table" ? (
          <section className="scanner-table-layout">
            <div className="list-header">
              <div>
                <p className="eyebrow">Scanner results</p>
                <h2>{sorted.length} rows</h2>
              </div>
              <span>{watchlist.size} watched</span>
            </div>
            <OpportunityTable
              formatPercent={formatPercent}
              items={sorted}
              onSelect={(symbol) => handleInspect(symbol)}
              onSort={handleSortChange}
              selectedSymbol={selectedStock?.symbol}
              sortDirection={sortDirection}
              sortKey={sortKey}
            />
          </section>
        ) : (
          <section className="scanner-workspace-layout scanner-workspace-layout-modal">
            <div className="scanner-results-rail">
              <div className="list-header scanner-workspace-header">
                <div>
                  <p className="eyebrow">Opportunity queue</p>
                  <h2>{displayed.length} candidates</h2>
                </div>
                <span>{compareItems.length ? `${compareItems.length} in compare` : `${watchlist.size} watched`}</span>
              </div>

              <ScannerOpportunityQueue
                compareSelection={compareSelection}
                groupedItems={groups}
                histories={historyBySymbol}
                onInspect={handleInspect}
                onToggleCompare={handleToggleCompare}
                onToggleWatchlist={toggleWatchlist}
                selectedSymbol={selectedStock?.symbol}
                watchlist={watchlist}
              />
            </div>
          </section>
        )}
      </div>

      <ScannerInspector
        activeHorizonProfile={activeHorizonProfile}
        activeStrategy={activeStrategy}
        compareItems={compareItems}
        formatPercent={formatPercent}
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
        onToggleWatchlist={toggleWatchlist}
        selectedStock={selectedStock}
        watchlist={watchlist}
      />
    </div>
  );
}
