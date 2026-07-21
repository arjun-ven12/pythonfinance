import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchPage from "./ResearchPage";
import { apiFetch } from "../../services/apiClient";

vi.mock("../../services/apiClient", () => ({ API_BASE_URL: "http://localhost:3000", apiFetch: vi.fn() }));
const ok = (payload) => Promise.resolve({ ok: true, json: async () => payload });
const summary = { id: "p-1", title: "AI Infrastructure", slug: "ai-infrastructure", researchType: "THEME_RESEARCH", status: "ACTIVE", scopeJson: { theme: "AI" }, updatedAt: "2026-07-11T02:00:00Z", _count: { reports: 1, notes: 1, theses: 1 } };
const report = { id: "r-1", reportType: "THEME_RESEARCH", title: "AI Infrastructure", executiveSummary: "AI infrastructure evidence remains mixed.", structuredContent: { limitations: ["News is stale."] }, evidenceSnapshot: [{ sourceType: "MARKET_DATA", sourceId: "feed:NVDA", metricName: "LastPrice", metricValue: "100", symbol: "NVDA" }], confidence: 72, dataFreshness: { marketDataTimestamp: "2026-07-11T01:00:00Z" }, versionNumber: 2, createdAt: "2026-07-11T02:00:00Z" };
const detail = { ...summary, description: "Track AI infrastructure demand.", createdAt: "2026-07-10T00:00:00Z", reports: [report], notes: [{ id: "n-1", content: "Watch capex guidance.", noteType: "USER_NOTE", createdAt: "2026-07-11T01:00:00Z" }], questions: [], theses: [{ id: "t-1", statement: "AI demand remains durable.", status: "THESIS_UNCHANGED", confidence: 65, versionNumber: 2, createdAt: "2026-07-11T01:00:00Z" }], timeline: [{ id: "report:r-1", type: "REPORT", title: "AI Infrastructure · v2", at: "2026-07-11T02:00:00Z" }] };

describe("ResearchWorkspace", () => {
  beforeEach(() => vi.clearAllMocks()); afterEach(cleanup);
  it("shows an empty persistent workspace without changing live research", async () => {
    apiFetch.mockImplementation(() => ok({ items: [], pagination: { total: 0 } })); render(<ResearchPage />);
    expect(screen.getByText(/what does this mean for your trading system/i)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Research Workspace" }));
    expect(await screen.findByText(/turn one-off research into a reviewable investigation/i)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /execute|buy|sell/i })).not.toBeInTheDocument();
  });
  it("navigates a dossier and renders saved report evidence, thesis, notes, and timeline", async () => {
    apiFetch.mockImplementation((url) => url.endsWith("/api/research/projects/p-1") ? ok(detail) : ok({ items: [summary], pagination: { total: 1 } })); render(<ResearchPage />); fireEvent.click(screen.getByRole("button", { name: "Research Workspace" }));
    expect(await screen.findByText("AI infrastructure evidence remains mixed.")).toBeInTheDocument(); expect(screen.getByText(/LastPrice: 100/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thesis" })); expect(screen.getByText("AI demand remains durable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notes" })); expect(screen.getByText("USER NOTE · UNVERIFIED CONTEXT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" })); expect(screen.getByText("AI Infrastructure · v2")).toBeInTheDocument();
  });
  it("creates a project explicitly", async () => {
    let created = false; apiFetch.mockImplementation((url, options = {}) => { if (url.endsWith("/api/research/projects") && options.method === "POST") { created = true; return ok({ ...summary, id: "p-2", status: "DRAFT" }); } if (url.endsWith("/api/research/projects/p-2")) return ok({ ...detail, id: "p-2", status: "DRAFT", reports: [], notes: [], theses: [], timeline: [] }); return ok({ items: created ? [{ ...summary, id: "p-2", status: "DRAFT" }] : [], pagination: { total: created ? 1 : 0 } }); });
    render(<ResearchPage />); fireEvent.click(screen.getByRole("button", { name: "Research Workspace" })); await screen.findByText(/turn one-off/i); fireEvent.change(screen.getByLabelText("New Research Project"), { target: { value: "Semiconductor Cycle" } }); fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("/api/research/projects"), expect.objectContaining({ method: "POST" }))); expect(JSON.parse(apiFetch.mock.calls.find(([, options]) => options?.method === "POST")[1].body).title).toBe("Semiconductor Cycle");
  });
});
