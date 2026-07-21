import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchPage from "./ResearchPage";
import { apiFetch } from "../../services/apiClient";

vi.mock("../../services/apiClient", () => ({ API_BASE_URL: "http://localhost:3000", apiFetch: vi.fn() }));

const result = {
  generatedAt: "2026-07-10T04:00:00Z", workflow: "SYMBOL_RESEARCH", researchOnly: true,
  freshness: { marketDataTimestamp: "2026-07-10T04:00:00Z", newsTimestamp: "2026-07-10T03:00:00Z", scannerTimestamp: "2026-07-10T04:00:00Z", portfolioSnapshotTimestamp: "2026-07-10T04:00:00Z", regimeTimestamp: "2026-07-10T04:00:00Z", staleSources: [] },
  response: {
    executiveSummary: "NVDA gained on a confirmed platform update.",
    keyFindings: [{ priority: 1, title: "Platform catalyst", finding: "The company announced an update.", whyItMatters: "It may affect demand expectations.", affectedSymbols: ["NVDA"], affectedSectors: ["Technology"], classification: "CONFIRMED_FACT" }],
    whyItMatters: ["NVDA is held in the portfolio."],
    relationshipMap: { nodes: [{ id: "news", system: "NEWS", label: "NVIDIA update", classification: "FACT" }, { id: "portfolio", system: "PORTFOLIO", label: "NVDA position", classification: "PLATFORM_EVIDENCE" }], edges: [{ from: "news", to: "portfolio", relationship: "The catalyst is relevant to a current holding.", confidence: 84 }] },
    report: { currentSituation: ["A company catalyst is active."], bullCase: [], bearCase: [], majorCatalysts: [], majorRisks: [], historicalContext: [], macroEnvironment: [], sectorAnalysis: [], relevantCompanies: ["NVDA"], keyUnknowns: ["Duration of demand impact"] },
    affectedSystems: { portfolio: ["NVDA is a current holding."], strategies: ["Momentum evidence should be reviewed."], matrix: [], scanner: ["NVDA appears in scanner results."], watchlist: [] },
    evidence: [{ sourceType: "NEWS", sourceId: "n1", sourceName: "Company investor relations", sourceQuality: "HIGH", symbol: "NVDA", sector: "Technology", theme: "", metricName: "Headline", metricValue: "Platform update", timestamp: "2026-07-10T03:00:00Z", dateRange: "", interpretation: "Official release.", strength: "HIGH", relevanceScore: 95 }],
    risksAlternativeInterpretations: ["Broader sector strength may also contribute."], confidenceScore: 84,
    dataFreshness: {}, suggestedFollowUpQuestions: ["How does this affect semiconductors?"], limitations: [],
  },
};

describe("ResearchPage", () => {
  beforeEach(() => vi.clearAllMocks()); afterEach(cleanup);
  it("shows the professional research empty state", () => { render(<ResearchPage />); expect(screen.getByText(/no research brief generated/i)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /buy|sell|execute/i })).not.toBeInTheDocument(); });
  it("validates required research input", () => { render(<ResearchPage />); fireEvent.click(screen.getByRole("button", { name: "Symbol" })); fireEvent.click(screen.getByRole("button", { name: "Run Research" })); expect(screen.getByText(/enter a research question/i)).toBeInTheDocument(); expect(apiFetch).not.toHaveBeenCalled(); });
  it("submits symbol research and renders prioritized evidence", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => result }); render(<ResearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Symbol" })); fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "nvda" } }); fireEvent.click(screen.getByRole("button", { name: "Run Research" }));
    await screen.findByText("NVDA gained on a confirmed platform update."); expect(screen.getByText("Platform catalyst")).toBeInTheDocument(); expect(screen.getByText(/HIGH source/i)).toBeInTheDocument();
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ question: "nvda", symbol: "NVDA" });
  });
  it("renders stale-source warnings and errors", async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...result, freshness: { ...result.freshness, staleSources: ["MARKET_DATA"] } }) }); render(<ResearchPage />); fireEvent.click(screen.getByRole("button", { name: "Generate Market Brief" }));
    await screen.findByText(/stale or missing sources: MARKET_DATA/i);
    cleanup(); apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Research unavailable." }) }); render(<ResearchPage />); fireEvent.click(screen.getByRole("button", { name: "Generate Market Brief" })); await waitFor(() => expect(screen.getByText("Research unavailable.")).toBeInTheDocument());
  });
  it("submits comparison research and renders cross-system relationships", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ ...result, workflow: "COMPARISON_RESEARCH" }) }); render(<ResearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Compare" })); fireEvent.change(screen.getByLabelText("Compare"), { target: { value: "NVDA vs AMD" } }); fireEvent.click(screen.getByRole("button", { name: "Build Research Report" }));
    await screen.findByText(/catalyst is relevant to a current holding/i); expect(screen.getByText("Affected Trading System")).toBeInTheDocument(); expect(screen.getByText("Key Unknowns")).toBeInTheDocument();
    expect(JSON.parse(apiFetch.mock.calls[0][1].body).symbols).toEqual(["NVDA", "AMD"]);
  });
  it("routes the NVIDIA comparison suggestion to comparison research", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ ...result, workflow: "COMPARISON_RESEARCH" }) }); render(<ResearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Compare NVIDIA vs AMD" })); expect(screen.getByLabelText("Compare")).toHaveValue("NVDA vs AMD"); fireEvent.click(screen.getByRole("button", { name: "Build Research Report" }));
    await screen.findByText("NVDA gained on a confirmed platform update."); expect(apiFetch.mock.calls[0][0]).toContain("/api/research/copilot/compare"); expect(JSON.parse(apiFetch.mock.calls[0][1].body).symbols).toEqual(["NVDA", "AMD"]);
  });
});
