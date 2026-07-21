import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioCopilotPanel from "./PortfolioCopilotPanel";
import { apiFetch } from "../../../services/apiClient";

vi.mock("../../../services/apiClient", () => ({
  API_BASE_URL: "http://localhost:3000",
  apiFetch: vi.fn(),
}));

const payload = {
  generatedAt: "2026-07-10T04:00:00.000Z",
  provider: "INTERNAL_PAPER",
  executionMode: "INTERNAL_PAPER",
  freshness: { stale: false, portfolioSnapshotTimestamp: "2026-07-10T04:00:00.000Z", reconciliationState: "MATCHED" },
  response: {
    summary: "The account is mostly cash.",
    keyFindings: ["Cash is 70% of equity."],
    reasoning: ["Account values support the finding."],
    evidence: [{
      sourceType: "ACCOUNT_SNAPSHOT", sourceId: "INTERNAL_PAPER", metricName: "Cash",
      metricValue: "70000.126", interpretation: "Current cash balance.", strength: "HIGH", symbol: "", strategy: "",
    }],
    confidenceScore: 88,
    dataLimitations: ["Correlation metrics are unavailable."],
    suggestedNextQuestion: "What is my largest position?",
  },
};

const proposal = {
  proposalType: "RISK_REDUCTION", title: "Reduce NVDA concentration", objective: "Lower single-name risk",
  actions: [{ actionType: "REDUCE_POSITION", symbol: "NVDA", sector: "", strategyId: "", matrixCell: { id: "", sector: "", regime: "" }, currentValue: 40, proposedValue: 15, unit: "PERCENT", targetWeights: [] }],
  assumptions: [], rationale: ["NVDA is the largest holding."], evidence: [], confidence: 82,
  expectedBenefit: "Lower concentration.", potentialDownside: "Less upside if NVDA rises.", simulationAvailable: true,
};

const recommendationPayload = {
  ...payload,
  advisoryOnly: true,
  noChangesApplied: true,
  response: {
    summary: "Concentration can be reduced.", portfolioConcernOrObjective: "Reduce single-name risk.",
    recommendations: [proposal], evidence: [], confidenceScore: 82, dataModelLimitations: [], availableUserActions: ["Simulate the proposal."],
  },
};

const scenarioPayload = {
  ...payload,
  proposal,
  comparison: {
    method: "SNAPSHOT_REALLOCATION", current: { cash: 20000, cashPct: 20, largestPositionPct: 40, largestSectorPct: 65, diversificationScore: 70, positions: [{ symbol: "NVDA", weightPct: 40 }] },
    proposed: { cash: 45000, cashPct: 45, largestPositionPct: 25, largestSectorPct: 40, diversificationScore: 82, positions: [{ symbol: "NVDA", weightPct: 15 }] },
    turnoverPct: 25, transactionCosts: { estimatedTotal: 38.5, affectedTrades: 1 },
  },
  response: {
    summary: "The snapshot lowers concentration.", portfolioConcernOrObjective: "Reduce single-name risk.", recommendation: "Review the trade-off.",
    proposedActions: ["Reduce NVDA."], evidence: [], expectedBenefits: ["Lower concentration."], risksTradeoffs: ["Potential upside is reduced."],
    confidenceScore: 78, dataModelLimitations: ["Volatility is unavailable."], availableUserActions: ["Try another target."],
  },
};

describe("PortfolioCopilotPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows suggested questions and validates an empty question", () => {
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
    expect(screen.getByRole("button", { name: "What is my biggest risk?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask Copilot" }));
    expect(screen.getByText(/enter a portfolio question/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("submits a question and renders grounded evidence", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => payload });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
    fireEvent.change(screen.getByLabelText(/ask about composition/i), { target: { value: "How much cash do I have?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Copilot" }));
    await waitFor(() => expect(screen.getByText("The account is mostly cash.")).toBeInTheDocument());
    expect(screen.getByText("70000.13")).toBeInTheDocument();
    expect(screen.getByText("88/100 confidence")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/portfolio/copilot/ask",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ question: "How much cash do I have?" }) })
    );
  });

  it("generates an overview without sending portfolio data from the browser", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => payload });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Overview" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).toContain("/api/portfolio/copilot/overview");
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({});
  });

  it("submits recommendation objectives and renders structured advisory options", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => recommendationPayload });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Recommend" }));
    fireEvent.change(screen.getByLabelText(/ask what you want to improve/i), { target: { value: "Reduce concentration" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendations" }));
    await waitFor(() => expect(screen.getByText("Reduce NVDA concentration")).toBeInTheDocument());
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toContain("/api/portfolio/copilot/recommend");
  });

  it("renders deterministic current-versus-proposed results", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => scenarioPayload });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Simulate" }));
    fireEvent.change(screen.getByLabelText(/ask what you want to improve/i), { target: { value: "Reduce NVDA to 15%" } });
    fireEvent.click(screen.getByRole("button", { name: "Run What-If" }));
    await waitFor(() => expect(screen.getByText("Current vs Proposed")).toBeInTheDocument());
    expect(screen.getByText(/25% estimated turnover/i)).toBeInTheDocument();
    expect(screen.getByText("Current Allocation")).toBeInTheDocument();
    expect(screen.getByText("Proposed Allocation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("can simulate a recommendation without creating an execution action", async () => {
    apiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => recommendationPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => scenarioPayload });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Recommend" }));
    fireEvent.change(screen.getByLabelText(/ask what you want to improve/i), { target: { value: "Reduce concentration" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Recommendations" }));
    await screen.findByText("Reduce NVDA concentration");
    fireEvent.click(screen.getByRole("button", { name: "Simulate this option" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(apiFetch.mock.calls[1][1].body);
    expect(body.proposal).toEqual(proposal);
    expect(apiFetch.mock.calls[1][0]).toContain("/api/portfolio/copilot/scenario");
  });

  it("generates, saves, approves, and discards a natural-language proposal", async () => {
    const saved = { id: "proposal-1", approvalStatus: "PENDING" };
    const approved = { id: "proposal-1", approvalStatus: "APPROVED" };
    apiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => scenarioPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => approved });
    render(<PortfolioCopilotPanel />);
    fireEvent.change(screen.getByLabelText(/ask what you want to improve/i), { target: { value: "Reduce technology exposure" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposal" }));
    await screen.findByText("Current vs Proposed");
    expect(apiFetch.mock.calls[0][0]).toContain("/api/portfolio/copilot/proposal");
    fireEvent.click(screen.getByRole("button", { name: "Save Proposal" }));
    await screen.findByText(/saved · pending/i);
    fireEvent.click(screen.getByRole("button", { name: "Approve Proposal" }));
    await screen.findByText(/saved · approved/i);
    expect(apiFetch.mock.calls[2][0]).toContain("/portfolio/copilot/proposals/proposal-1/approve");
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Current vs Proposed")).not.toBeInTheDocument();
  });

  it("keeps advanced mode optional and validates numeric bounds", () => {
    render(<PortfolioCopilotPanel />);
    expect(screen.queryByLabelText("Target Cash %")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /advanced mode/i }));
    fireEvent.change(screen.getByLabelText("Target Cash %"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/ask what you want to improve/i), { target: { value: "Hold more cash" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposal" }));
    expect(screen.getByText(/advanced numeric targets/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("loads immutable proposal history for the current user", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ proposals: [{ id: "p1", title: "Hold more cash", objective: "Target 25% cash", approvalStatus: "PENDING", provider: "INTERNAL_PAPER", createdAt: "2026-07-10T04:00:00Z", promptVersion: "v1", simulationVersion: "portfolio-scenario-v1" }] }) });
    render(<PortfolioCopilotPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Proposal History" }));
    await screen.findByText("Saved Proposal History");
    expect(screen.getByText("Hold more cash")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toContain("/api/portfolio/copilot/proposals");
  });
});
