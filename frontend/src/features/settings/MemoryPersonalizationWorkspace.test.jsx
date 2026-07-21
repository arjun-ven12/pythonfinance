import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../services/apiClient";
import MemoryPersonalizationWorkspace from "./MemoryPersonalizationWorkspace";

vi.mock("../../services/apiClient", () => ({ API_BASE_URL: "http://localhost:3000", apiFetch: vi.fn() }));

const ok = (payload) => Promise.resolve({ ok: true, json: async () => payload });
const profile = {
  profile: { status: "DEVELOPING_PROFILE", version: 2, confidence: 71 },
  memoryCount: 2,
  preferences: [],
  patterns: [],
  settings: {
    globalMode: "EVIDENCE_ONLY",
    strategyMode: "EVIDENCE_ONLY",
    portfolioMode: "EVIDENCE_ONLY",
    matrixMode: "EVIDENCE_ONLY",
    researchMode: "EVIDENCE_ONLY",
    inferredRequiresReview: true,
  },
};
const memories = [
  {
    id: "scan-1",
    category: "SCANNER",
    eventType: "SCAN_COMPLETED",
    title: "Scanner run completed",
    summary: "9 opportunities flagged, 0 alerts raised.",
    importance: 45,
    occurredAt: "2026-07-21T10:00:00.000Z",
    links: [{ entityType: "SOURCE", entityId: "scanner" }],
  },
  {
    id: "opp-1",
    category: "SCANNER",
    eventType: "OPPORTUNITY_IDENTIFIED",
    title: "SNDK opportunity identified",
    summary: "Recorded as scanner opportunity, score 232.95.",
    importance: 52,
    occurredAt: "2026-07-21T10:00:00.000Z",
    links: [{ entityType: "SYMBOL", entityId: "SNDK" }],
  },
];

describe("MemoryPersonalizationWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/events?")) return ok({ events: memories });
      if (url.includes("/personalization/profile")) return ok(profile);
      return ok({ updated: true });
    });
  });
  afterEach(cleanup);

  it("renders the reference Memory & AI hierarchy and conservative controls", async () => {
    render(<MemoryPersonalizationWorkspace />);
    expect(await screen.findByRole("heading", { name: "Memory & AI" })).toBeInTheDocument();
    expect(screen.getByText("AI KNOWLEDGE LAYER")).toBeInTheDocument();
    expect(screen.getByText(/Current evidence and deterministic validation always take precedence/i)).toBeInTheDocument();
    expect(screen.getByText("No recurring patterns detected yet")).toBeInTheDocument();
    expect(screen.getByText(/No explicit preferences yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("evidence");
  });

  it("maps inferred access onto the existing personalization API without trading mutations", async () => {
    render(<MemoryPersonalizationWorkspace />);
    const controls = await screen.findAllByRole("combobox");
    fireEvent.change(controls[1], { target: { value: "inferred" } });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/memory/personalization/settings"),
      expect.objectContaining({ method: "PATCH" }),
    ));
    const call = apiFetch.mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(call[1].body)).toEqual({ strategyMode: "PERSONALIZATION_ALLOWED", inferredRequiresReview: true });
    expect(apiFetch.mock.calls.some(([url]) => /order|trade|deploy|approval/.test(url))).toBe(false);
  });

  it("uses the same filters for list and node views while dimming filtered graph nodes", async () => {
    render(<MemoryPersonalizationWorkspace />);
    expect(await screen.findByText("Scanner run completed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opportunity" }));
    expect(screen.queryByText("Scanner run completed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Node" }));
    const scannerNode = screen.getByRole("button", { name: "Scanner run completed memory node" });
    const opportunityNode = screen.getByRole("button", { name: "SNDK opportunity identified memory node" });
    expect(scannerNode).toHaveAttribute("opacity", "0.15");
    expect(opportunityNode).toHaveAttribute("opacity", "1");
  });

  it("selects a graph node and removes a deleted memory from both views", async () => {
    render(<MemoryPersonalizationWorkspace />);
    await screen.findByText("Scanner run completed");
    fireEvent.click(screen.getByRole("tab", { name: "Node" }));
    fireEvent.click(screen.getByRole("button", { name: "SNDK opportunity identified memory node" }));
    const detail = screen.getByText("Recorded as scanner opportunity, score 232.95.").closest("aside");
    expect(detail).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("/api/memory/events/opp-1"), { method: "DELETE" }));
    expect(screen.queryByRole("button", { name: "SNDK opportunity identified memory node" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close node detail" })).not.toBeInTheDocument();
  });

  it("requires a second explicit click before a danger action fires", async () => {
    render(<MemoryPersonalizationWorkspace />);
    const trigger = await screen.findByRole("button", { name: "Reset inferred personalization" });
    fireEvent.click(trigger);
    expect(apiFetch.mock.calls.some(([url]) => url.endsWith("/api/memory/personalization/reset"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Yes, proceed" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([url]) => url.endsWith("/api/memory/personalization/reset"))).toBe(true));
  });
});
