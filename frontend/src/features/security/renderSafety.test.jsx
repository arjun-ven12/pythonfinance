import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectionLogPanel from "../broker/components/ConnectionLogPanel";
import TradingCockpitApp from "../tradingCockpit/TradingCockpitApp";
import ValidationDashboard from "../validation/ValidationPage";

function demoResponse(payload) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("render safety", () => {
  it("renders broker error messages as text instead of HTML", () => {
    render(
      <ConnectionLogPanel
        logs={[
          {
            id: "log-1",
            timestamp: "2026-07-03T10:00:00.000Z",
            action: "test",
            success: false,
            error: '<img src=x alt="xss-broker" />',
          },
        ]}
      />
    );

    expect(screen.getByText('<img src=x alt="xss-broker" />')).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "xss-broker" })).toBeNull();
  });

  it("renders validation insights as text instead of HTML", () => {
    render(
      <ValidationDashboard
        confidenceData={{
          dataset_built: true,
          totals: { signals: 1, evaluated: 1 },
          confidence: [],
          insights: [
            {
              type: "EVIDENCE",
              title: '<img src=x alt="xss-insight" />',
              explanation: '<script>alert("xss")</script>',
              confidenceLevel: "HIGH",
              sampleCount: 12,
            },
          ],
          warnings: [],
        }}
        error=""
        onRefresh={() => {}}
        openAiData={{}}
        regimeData={{}}
        sectorData={{}}
      />
    );

    expect(screen.getByText('<img src=x alt="xss-insight" />')).toBeInTheDocument();
    expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "xss-insight" })).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders demo fixture text safely", async () => {
    window.history.replaceState({}, "", "/demo");
    vi.stubGlobal("fetch", vi.fn((input) => {
      const url = String(input);

      if (url.includes("/api/demo/dashboard")) {
        return demoResponse({
          isDemoMode: true,
          label: "DEMO DATA",
          payload: {
            marketOpen: {
              regime: '<img src=x alt="xss-demo" />',
              activeDeploymentSet: "Momentum Lab v12",
              universe: "US large caps + SG watchlist",
              systemStatus: "Paper-only",
              marketTone: "Stable",
            },
            deploymentSet: [],
            riskSummary: {
              accountEquity: 10000,
              cash: 4000,
              dailyRiskUsagePct: 12,
              weeklyRiskUsagePct: 19,
              openExposurePct: 32,
            },
            missionSnapshot: {
              scannerUniverse: 50,
              approvalsOpen: 4,
              portfolioPositions: 2,
              validationConfidence: 0.8,
              brokerState: "Disabled",
            },
          },
        });
      }

      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {},
      });
    }));

    render(<TradingCockpitApp />);

    fireEvent.click(await screen.findByRole("button", { name: /start demo/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Market Opens/i })).toBeInTheDocument()
    );
    expect(screen.getByText('<img src=x alt="xss-demo" />')).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "xss-demo" })).toBeNull();
  });
});
