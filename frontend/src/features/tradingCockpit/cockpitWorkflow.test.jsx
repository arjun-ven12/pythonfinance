import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalsPage from "../approvals/ApprovalsPage";
import PortfolioPage from "../portfolio/PortfolioPage";
import ScannerPage from "../scanner/ScannerPage";
import SettingsHarness from "./testUtils/SettingsHarness";

function renderScanner(overrides = {}) {
  const scanner = {
    counts: { ALL: 1, BUY: 1, HOLD: 0, SELL: 0 },
    displayed: [],
    expandedSymbols: new Set(),
    filter: "ALL",
    handleClearScannedStocks: vi.fn(),
    handleScanSearchSymbol: vi.fn(),
    handleSortChange: vi.fn(),
    isSearchTicker: true,
    quickFilters: {},
    scannerCurrencyFilter: "ALL",
    scannerExchangeFilter: "ALL",
    scannerMarketFilter: "ALL",
    scannerView: "cards",
    search: "MSFT",
    searchExactMatch: false,
    searchTerm: "MSFT",
    selectedSectorFilter: "",
    setFilter: vi.fn(),
    setScannerCurrencyFilter: vi.fn(),
    setScannerExchangeFilter: vi.fn(),
    setScannerMarketFilter: vi.fn(),
    setScannerView: vi.fn(),
    setSearchTerm: vi.fn(),
    setSelectedSectorFilter: vi.fn(),
    setSortDirection: vi.fn(),
    sortDirection: "desc",
    sortKey: "opportunity_score",
    sorted: [],
    toggleExpanded: vi.fn(),
    toggleQuickFilter: vi.fn(),
    ...overrides,
  };

  render(
    <ScannerPage
      scanner={scanner}
      CURRENCY_FILTERS={["ALL", "USD"]}
      EXCHANGE_FILTERS={["ALL", "NASDAQ"]}
      FILTERS={["ALL", "BUY", "HOLD", "SELL"]}
      MARKET_FILTERS={["ALL", "US"]}
      QUICK_FILTERS={[{ key: "buyOnly", label: "BUY only" }]}
      SORT_OPTIONS={[{ key: "opportunity_score", label: "Opportunity Score" }]}
      activeHorizonProfile={{}}
      activeStrategy={{}}
      data={{ opportunities: [{ symbol: "AAPL" }] }}
      drawdownThreshold="10"
      formatPercent={(value) => `${value}%`}
      isScanning={false}
      scanWatchlistOnly={false}
      scoreThreshold="60"
      selectedStock={null}
      setDetailSymbol={vi.fn()}
      setDrawdownThreshold={vi.fn()}
      setScanWatchlistOnly={vi.fn()}
      setScoreThreshold={vi.fn()}
      setSelectedSymbol={vi.fn()}
      toggleWatchlist={vi.fn()}
      watchlist={new Set()}
    />
  );
  return scanner;
}

function renderApprovals(status = "PENDING") {
  const handleApprovalAction = vi.fn();
  const request = {
    id: "approval-1",
    symbol: "RKLB",
    side: "BUY",
    quantity: 10,
    entryPrice: 12.5,
    stopLoss: 10,
    takeProfit: 18,
    confidence: 84,
    opportunityScore: 78,
    riskLevel: "MEDIUM",
    recommendation: "EXECUTE",
    status,
  };

  render(
    <ApprovalsPage
      approvals={{
        approvalActionId: "",
        approvalCounts: { PENDING: 1, APPROVED: status === "APPROVED" ? 1 : 0 },
        approvalFilter: status,
        approvalNotes: {},
        handleApprovalAction,
        handleApprovalNoteChange: vi.fn(),
        handleApprovalTradeEdit: vi.fn(),
        selectedApprovalRequest: request,
        setApprovalFilter: vi.fn(),
        setSelectedApprovalRequestId: vi.fn(),
        visibleApprovalRequests: [request],
      }}
      activeHorizonLabel="Swing"
      approvalStatuses={["PENDING", "APPROVED", "REJECTED", "SNOOZED", "EXECUTED"]}
      formatMoney={(value) => `$${value}`}
      formatRatioPercent={(value) => `${value}`}
      preTrade={{
        analyze: vi.fn(),
        buildFromApproval: vi.fn(),
        error: "",
        form: {
          entryPrice: "",
          quantity: "",
          side: "BUY",
          stopLoss: "",
          symbol: "",
          takeProfit: "",
        },
        loading: false,
        result: null,
        updateField: vi.fn(),
      }}
    />
  );
  return handleApprovalAction;
}

describe("cockpit workflow smoke tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scanner search can trigger a symbol scan and clear scanned stocks", () => {
    const scanner = renderScanner();
    fireEvent.click(screen.getByRole("button", { name: /scan msft/i }));
    expect(scanner.handleScanSearchSymbol).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(scanner.handleClearScannedStocks).toHaveBeenCalledTimes(1);
  });

  it("approval queue exposes approve reject and execute actions", () => {
    const handleApprovalAction = renderApprovals("PENDING");
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    expect(handleApprovalAction).toHaveBeenCalledWith("approval-1", "approve");
    expect(handleApprovalAction).toHaveBeenCalledWith("approval-1", "reject");
  });

  it("approved approval requests expose paper execution", () => {
    const handleApprovalAction = renderApprovals("APPROVED");
    const executeButton = screen
      .getAllByRole("button", { name: /execute .*paper order/i })
      .find((button) => !button.disabled);
    fireEvent.click(executeButton);
    expect(handleApprovalAction).toHaveBeenCalledWith("approval-1", "execute-paper");
  });

  it("portfolio section tabs switch between overview construction and risk", () => {
    const setPortfolioSection = vi.fn();
    render(
      <PortfolioPage
        portfolio={{
          bestPortfolioAdditions: [],
          constructionCash: 1000,
          constructionEquity: 1000,
          constructionLimits: {},
          constructionPortfolio: {},
          constructionPositions: [],
          constructionRecommendations: [],
          constructionRisk: {},
          constructionSectors: [],
          constructionWarnings: {},
          constructionWeights: {},
          isInternalPaperMode: false,
          largestConstructionPosition: null,
          largestConstructionSector: null,
          paperPositions: [],
          paperTrades: [],
          portfolioSection: "Overview",
          setPortfolioSection,
        }}
        formatMoney={(value) => `$${Number(value || 0).toFixed(2)}`}
        formatSafetyPercent={(value) => `${value || 0}%`}
        handleRebuildPortfolio={vi.fn()}
        isRebuildingPortfolio={false}
        manualOpenTradePositions={[]}
        manualOpenTradeValue={0}
        paperError=""
        paperPortfolio={{ equity: 100000, cash: 100000 }}
        portfolioConstructionData={{}}
        portfolioConstructionError=""
        portfolioReconciliation={{ matched: true, ledgerVerified: true, status: "OK" }}
        portfolioReconciliationError=""
        riskDashboardData={{}}
        riskDashboardError=""
        setDetailSymbol={vi.fn()}
        setSelectedSymbol={vi.fn()}
      />
    );
    expect(screen.queryByText(/manual journal/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /construction/i }));
    fireEvent.click(screen.getByRole("button", { name: /^risk$/i }));
    expect(setPortfolioSection).toHaveBeenCalledWith("Construction");
    expect(setPortfolioSection).toHaveBeenCalledWith("Risk");
  });

  it("settings admin mode persists to localStorage", async () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: /enable admin/i }));
    await waitFor(() => {
      expect(localStorage.getItem("adminMode")).toBe("true");
    });
  });
});
