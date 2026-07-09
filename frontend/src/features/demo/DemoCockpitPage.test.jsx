import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TradingCockpitApp from "../tradingCockpit/TradingCockpitApp";

function demoResponse(payload) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function createFetchMock() {
  return vi.fn((input) => {
    const url = String(input);

    if (url.includes("/api/demo/dashboard")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          marketOpen: {
            regime: "Bull Low Vol",
            activeDeploymentSet: "Momentum Lab v12",
            universe: "US large caps + SG watchlist",
            systemStatus: "Paper-only",
            marketTone: "Tone",
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

    if (url.includes("/api/demo/scanner")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          progressStages: ["Scanning 50 stocks", "Ranking candidates", "Validating strategy fit", "Applying risk filters"],
          filters: ["ALL", "NOW", "WATCH", "AVOID"],
          highlightedSymbol: "AMD",
          opportunities: [
            {
              symbol: "AMD",
              company: "Advanced Micro Devices",
              disposition: "NOW",
              opportunityScore: 91,
              confidence: 0.87,
              strategyVersion: "Momentum Lab v12",
              regime: "Bull Low Vol",
            },
          ],
          opportunityDetail: {
            symbol: "AMD",
            score: 91,
            confidence: 0.87,
            strategyVersion: "Momentum Lab v12",
            validationEvidence: ["Evidence item"],
            newsRiskContext: "No news risk",
            portfolioFit: "Good fit",
          },
        },
      });
    }

    if (url.includes("/api/demo/strategy-lab")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          attribution: {
            selectedSymbol: "AMD",
            selectedBy: "Momentum Lab v12",
            readinessGate: "PASSED",
            walkForwardStatus: "PASSED",
          },
          strategies: [],
          comparison: [],
          versionTimeline: [],
        },
      });
    }

    if (url.includes("/api/demo/approvals")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          approvals: [
            {
              id: "demo-appr-1",
              symbol: "AMD",
              status: "PENDING",
              strategy: "Momentum Lab v12",
              note: "Primary opportunity",
            },
          ],
          approvalDetail: {
            pendingApproval: true,
            preTradeRisk: "Medium",
            safetyChecklist: ["Checklist item"],
            positionSizeAdjustment: "Reduced size",
            approvalNote: "Approval note",
          },
          blockedTrade: {
            symbol: "NVDA",
            reason: "Blocked by safety",
          },
          executionPreview: {
            brokerDisabled: true,
            paperOnlyOutcome: "Paper only",
            ledgerPreview: {
              symbol: "AMD",
              quantity: 18,
              estimatedFill: 172.2,
              fee: 1.25,
            },
          },
        },
      });
    }

    if (url.includes("/api/demo/portfolio")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          summary: {
            totalValue: 8602.4,
            cash: 8120,
            paperPnL: 412.7,
            sectorAllocation: [],
            riskImpact: {
              cashAfterTrade: 5020.15,
              exposureAfterTradePct: 53,
              sectorImpact: "Semiconductors rise",
            },
          },
          positions: [],
          executionPath: ["Approval accepted"],
        },
      });
    }

    if (url.includes("/api/demo/validation")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          labels: ["Validated strategy"],
          confidenceBuckets: [{ bucket: "80-90%", expectedWinRate: 64, actualWinRate: 61 }],
          sampleOutcome: {
            expected: "Expected move",
            actual: "Actual move",
            calibration: "Within tolerance",
          },
        },
      });
    }

    if (url.includes("/api/demo/playbook")) {
      return demoResponse({
        isDemoMode: true,
        label: "DEMO DATA",
        payload: {
          labels: ["Read-only"],
          versionNote: "Version note",
          strategyLesson: "Lesson",
          evidenceUpdated: true,
          decisionRecorded: "Recorded",
          deploymentScoreChange: {
            previous: 84,
            current: 86,
          },
        },
      });
    }

    return demoResponse({});
  });
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("guided trading day demo", () => {
  it("shows the intro modal and starts the guided mission", async () => {
    window.history.replaceState({}, "", "/demo");
    vi.stubGlobal("fetch", createFetchMock());

    render(<TradingCockpitApp />);

    expect(
      await screen.findByText(/Explore how the platform turns market data into validated trading decisions/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start demo/i }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Market Opens/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/1 \/ 10/i)).toBeInTheDocument();
  });

  it("advances through mission navigation", async () => {
    window.history.replaceState({}, "", "/demo");
    window.sessionStorage.setItem("guidedTradingDayIntroSeen", "true");
    vi.stubGlobal("fetch", createFetchMock());

    render(<TradingCockpitApp />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Market Opens/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^Next$/i })[0]);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Scanner Finds Opportunities/i })).toBeInTheDocument()
    );
    expect(window.location.pathname).toBe("/demo/scanner");
  });
});
