import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StrategyCopilotPanel from "./StrategyCopilotPanel";
import { createStrategyCopilotPreferences } from "../strategyCopilotPreferences";

afterEach(() => {
  cleanup();
});

function renderPanel(overrides = {}) {
  const props = {
    draft: {
      loading: false,
      error: "",
      mode: "draft",
      result: null,
    },
    experiments: [],
    onAskQuestion: vi.fn(),
    onAskResearchQuestion: vi.fn(),
    onApplyDraft: vi.fn(),
    onApproveAndSave: vi.fn(),
    onCompare: vi.fn(),
    onCompareVersions: vi.fn(),
    onDismiss: vi.fn(),
    onExplain: vi.fn(),
    onGenerate: vi.fn(),
    onGenerateResearchReport: vi.fn(),
    onProposeEdit: vi.fn(),
    onReview: vi.fn(),
    preferences: createStrategyCopilotPreferences(),
    prompt: "",
    selectedCompareTargetId: "",
    selectedCompareVersionId: "",
    selectedExperiment: { id: "exp-1", name: "Momentum Lab", versions: [] },
    setCompareTargetId: vi.fn(),
    setCompareVersionId: vi.fn(),
    setPreferences: vi.fn(),
    setPrompt: vi.fn(),
    ...overrides,
  };

  render(<StrategyCopilotPanel {...props} />);
  return props;
}

describe("StrategyCopilotPanel", () => {
  it("shows simple draft mode by default and hides advanced controls", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "What would you like to build?" })).toBeInTheDocument();
    expect(screen.getByText("Describe your strategy in plain English.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced Mode" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Trading Style")).not.toBeInTheDocument();
    expect(screen.getByText("Build a momentum strategy for large-cap US technology stocks.")).toBeInTheDocument();
  });

  it("expands advanced mode and preserves entered prompt", () => {
    const setPreferences = vi.fn();
    renderPanel({
      prompt: "Build a breakout strategy.",
      setPreferences,
    });

    fireEvent.click(screen.getByRole("button", { name: "Advanced Mode" }));

    expect(setPreferences).toHaveBeenCalled();
    expect(screen.getByDisplayValue("Build a breakout strategy.")).toBeInTheDocument();
  });

  it("renders advanced fields when advanced mode is enabled", () => {
    const preferences = createStrategyCopilotPreferences();
    preferences.advancedMode = true;
    preferences.objectives = ["MAXIMIZE_SHARPE"];
    preferences.sectors = ["TECHNOLOGY"];

    renderPanel({ preferences });

    expect(screen.getByLabelText("Trading Style")).toBeInTheDocument();
    expect(screen.getByLabelText("Market / Universe")).toBeInTheDocument();
    expect(screen.getByLabelText("Risk Level")).toBeInTheDocument();
    expect(screen.getByLabelText("Holding Period")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize Sharpe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Technology" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Avoid earnings periods")).toBeInTheDocument();
  });

  it("renders compact evidence cards for advisory responses", async () => {
    renderPanel({
      draft: {
        loading: false,
        error: "",
        mode: "research",
        result: {
          advisory: {
            summary: "Summary",
            recommendation: "Recommendation",
            reasoning: ["Reasoning"],
            evidence: [
              {
                sourceType: "BACKTEST",
                sourceId: "run-1",
                metricName: "Sharpe",
                metricValue: "1.12",
                interpretation: "Latest saved backtest Sharpe ratio.",
                strength: "HIGH",
              },
            ],
            confidenceScore: 82,
            limitations: ["Evidence still maturing"],
            nextAction: "Run more validation.",
            reasoningBreakdown: {
              evidenceBackedStatements: ["Sharpe is positive."],
              inferences: [],
              suggestions: [],
              unknowns: [],
            },
          },
          report: {
            executiveSummary: "Executive summary",
            performanceSummary: "Performance summary",
            strengths: [],
            weaknesses: [],
            riskAssessment: [],
            regimeAnalysis: [],
            robustnessReview: [],
            executionAnalysis: [],
            capitalUsage: [],
            failureModes: [],
            researchRecommendations: [],
            supportingMetrics: [],
            knownLimitations: [],
            confidenceScore: 82,
          },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Research Report" }));

    expect(screen.getByRole("heading", { name: "Recommendation" })).toBeInTheDocument();
    expect(screen.getByText("BACKTEST")).toBeInTheDocument();
    expect(screen.getByText("Sharpe")).toBeInTheDocument();
    expect(screen.getByText("1.12")).toBeInTheDocument();
  });
});
