import { useCallback, useMemo, useState } from "react";
import { normalizeExchange } from "../../../utils/marketMetadata";

export default function useScanner({
  data,
  drawdownThreshold,
  runSymbolScan,
  scoreThreshold,
  setData,
  setDetailSymbol,
  setSelectedSymbol,
  signalThreshold,
}) {
  const [filter, setFilter] = useState("ALL");
  const [scannerView, setScannerView] = useState("cards");
  const [sortKey, setSortKey] = useState("opportunity_score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSectorFilter, setSelectedSectorFilter] = useState("");
  const [heatmapTimeframe, setHeatmapTimeframe] = useState("today");
  const [heatmapMode, setHeatmapMode] = useState("signals");
  const [scannerMarketFilter, setScannerMarketFilter] = useState("ALL");
  const [scannerExchangeFilter, setScannerExchangeFilter] = useState("ALL");
  const [scannerCurrencyFilter, setScannerCurrencyFilter] = useState("ALL");
  const [quickFilters, setQuickFilters] = useState({
    buyOnly: false,
    scoreAbove60: false,
    drawdownBelow10: false,
    beatsBuyHold: false,
  });
  const [expandedSymbols, setExpandedSymbols] = useState(new Set());

  const opportunities = useMemo(() => data?.opportunities || [], [data?.opportunities]);
  const search = searchTerm.trim().toUpperCase();
  const isSearchTicker = /^[A-Z0-9.-]{1,12}$/.test(search);
  const searchExactMatch = opportunities.some((item) => item.symbol === search);
  const signalThresholdValue = Number(signalThreshold);
  const scoreThresholdValue = Number(scoreThreshold);
  const drawdownThresholdValue = Number(drawdownThreshold);

  const counts = useMemo(
    () =>
      opportunities.reduce(
        (acc, item) => {
          acc.ALL += 1;
          acc[item.signal] = (acc[item.signal] || 0) + 1;
          return acc;
        },
        { ALL: 0, BUY: 0, HOLD: 0, SELL: 0 }
      ),
    [opportunities]
  );

  const matchesDashboardMarketScope = useCallback(
    (item) => {
      const market = item.market || (item.is_sgx ? "Singapore" : "US");
      const exchange = normalizeExchange(item.exchange, item);
      const currency = item.currency || "USD";

      if (scannerMarketFilter !== "ALL" && market !== scannerMarketFilter) return false;
      if (scannerExchangeFilter !== "ALL" && exchange !== scannerExchangeFilter) return false;
      if (scannerCurrencyFilter !== "ALL" && currency !== scannerCurrencyFilter) return false;

      return true;
    },
    [scannerCurrencyFilter, scannerExchangeFilter, scannerMarketFilter]
  );

  const dashboardOpportunities = useMemo(
    () => opportunities.filter(matchesDashboardMarketScope),
    [matchesDashboardMarketScope, opportunities]
  );

  const dashboardCounts = useMemo(
    () =>
      dashboardOpportunities.reduce(
        (acc, item) => {
          acc.ALL += 1;
          acc[item.signal] = (acc[item.signal] || 0) + 1;
          return acc;
        },
        { ALL: 0, BUY: 0, HOLD: 0, SELL: 0 }
      ),
    [dashboardOpportunities]
  );

  const sorted = useMemo(() => {
    const filtered = opportunities.filter((item) => {
      const beatsBuyHold = Number(item.backtest_return) > Number(item.buy_and_hold);
      const market = item.market || (item.is_sgx ? "Singapore" : "US");
      const exchange = normalizeExchange(item.exchange, item);
      const currency = item.currency || "USD";
      const searchable = [
        item.symbol,
        item.display_symbol,
        item.company_name,
        exchange,
        item.market,
      ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

      if (filter !== "ALL" && item.signal !== filter) return false;
      if (search && !searchable.includes(search)) return false;
      if (selectedSectorFilter && item.sector !== selectedSectorFilter) return false;
      if (scannerMarketFilter !== "ALL" && market !== scannerMarketFilter) return false;
      if (scannerExchangeFilter !== "ALL" && exchange !== scannerExchangeFilter) return false;
      if (scannerCurrencyFilter !== "ALL" && currency !== scannerCurrencyFilter) return false;
      if (signalThresholdValue > 0 && Number(item.confidence) < signalThresholdValue) {
        return false;
      }
      if (quickFilters.buyOnly && item.signal !== "BUY") return false;
      if (
        quickFilters.scoreAbove60 &&
        Number(item.opportunity_score) <= scoreThresholdValue
      ) {
        return false;
      }
      if (
        quickFilters.drawdownBelow10 &&
        Number(item.drawdown) >= drawdownThresholdValue
      ) {
        return false;
      }
      if (quickFilters.beatsBuyHold && !beatsBuyHold) return false;

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (
        ["symbol", "signal", "market", "exchange", "currency", "sector"].includes(sortKey)
      ) {
        const leftValue = sortKey === "exchange" ? normalizeExchange(a.exchange, a) : a[sortKey];
        const rightValue = sortKey === "exchange" ? normalizeExchange(b.exchange, b) : b[sortKey];
        const comparison = String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? comparison : -comparison;
      }

      const aValue = Number(a[sortKey]) || 0;
      const bValue = Number(b[sortKey]) || 0;

      if (sortDirection === "asc") {
        return aValue - bValue;
      }

      return bValue - aValue;
    });
  }, [
    drawdownThresholdValue,
    filter,
    opportunities,
    quickFilters,
    scannerCurrencyFilter,
    scannerExchangeFilter,
    scannerMarketFilter,
    scoreThresholdValue,
    search,
    selectedSectorFilter,
    signalThresholdValue,
    sortDirection,
    sortKey,
  ]);

  const handleClearScannedStocks = useCallback(() => {
    setData((currentData) =>
      currentData
        ? {
            ...currentData,
            opportunities: [],
            cleared_at: new Date().toISOString(),
          }
        : currentData
    );
    setSelectedSymbol("");
    setDetailSymbol("");
    setExpandedSymbols(new Set());
    setSearchTerm("");
    setSelectedSectorFilter("");
  }, [setData, setDetailSymbol, setSelectedSymbol]);

  const handleScanSearchSymbol = useCallback(async () => {
    const symbol = searchTerm.trim().toUpperCase();

    const job = await runSymbolScan(symbol);
    if (job) {
      setSearchTerm(symbol);
    }
  }, [
    runSymbolScan,
    searchTerm,
  ]);

  const handleSortChange = useCallback(
    (key) => {
      if (sortKey === key) {
        setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
        return;
      }

      setSortKey(key);
      setSortDirection(
        key === "drawdown" || key === "symbol" || key === "signal" ? "asc" : "desc"
      );
    },
    [sortKey]
  );

  const toggleExpanded = useCallback((symbol) => {
    setExpandedSymbols((current) => {
      const next = new Set(current);

      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }

      return next;
    });
  }, []);

  const toggleQuickFilter = useCallback((key) => {
    setQuickFilters((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  return {
    counts,
    dashboardCounts,
    dashboardOpportunities,
    displayed: sorted,
    expandedSymbols,
    filter,
    handleClearScannedStocks,
    handleScanSearchSymbol,
    handleSortChange,
    heatmapMode,
    heatmapTimeframe,
    isSearchTicker,
    quickFilters,
    scannerCurrencyFilter,
    scannerExchangeFilter,
    scannerMarketFilter,
    scannerView,
    search,
    searchExactMatch,
    searchTerm,
    selectedSectorFilter,
    setFilter,
    setHeatmapMode,
    setHeatmapTimeframe,
    setQuickFilters,
    setScannerCurrencyFilter,
    setScannerExchangeFilter,
    setScannerMarketFilter,
    setScannerView,
    setSearchTerm,
    setSelectedSectorFilter,
    setSortDirection,
    setSortKey,
    sortDirection,
    sortKey,
    sorted,
    toggleExpanded,
    toggleQuickFilter,
  };
}
