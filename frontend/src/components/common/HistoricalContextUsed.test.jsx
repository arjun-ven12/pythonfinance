import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HistoricalContextUsed from "./HistoricalContextUsed";

afterEach(cleanup);

describe("HistoricalContextUsed", () => {
  it("renders an expandable, evidence-safe memory summary", () => {
    render(<HistoricalContextUsed context={{ notice: "Historical context is supporting evidence.", memories: [{ title: "Momentum v8 deployed", category: "STRATEGY", date: "2026-07-10T00:00:00Z", importance: 95, confidence: 88, retrievalReason: ["same strategy"] }] }} />);
    const summary = screen.getByText("Historical Context Used");
    expect(summary).toBeInTheDocument();
    fireEvent.click(summary);
    expect(screen.getByText("Momentum v8 deployed")).toBeInTheDocument();
    expect(screen.getByText(/same strategy/i)).toBeInTheDocument();
    expect(screen.queryByText(/vector|structuredData/i)).not.toBeInTheDocument();
  });

  it("discloses an honest no-memory fallback", () => {
    render(<HistoricalContextUsed context={{ notice: "No relevant historical context available.", memories: [] }} />);
    fireEvent.click(screen.getByText("Historical Context Used"));
    expect(screen.getAllByText("No relevant historical context available.").length).toBeGreaterThan(0);
  });

  it("discloses explicit and inferred personalization separately", () => {
    render(<HistoricalContextUsed context={{ memories: [], personalization: { profileVersion: 3, confidence: 78, preferences: [{ id: "p1", key: "LOWER_DRAWDOWN", source: "USER_EXPLICIT", confidence: 100, evidenceCount: 1, contradictingEvidenceCount: 0 }], patterns: [{ id: "b1", title: "Defensive decision pattern", confidence: 72, sampleSize: 6, contradictingEvidenceCount: 1 }] } }} />);
    fireEvent.click(screen.getByText("Historical Context Used"));
    expect(screen.getByText("Explicit preference")).toBeInTheDocument();
    expect(screen.getByText("Observed pattern")).toBeInTheDocument();
    expect(screen.getByText(/current evidence and deterministic validation take precedence/i)).toBeInTheDocument();
  });
});
