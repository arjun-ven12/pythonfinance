import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PARAMETER_SWEEP,
  DEFAULT_STRATEGY_EXPERIMENT,
} from "../constants";
import useStrategyLab from "./useStrategyLab";
import { __resetApiRequestManagerForTests } from "../../../services/apiRequestManager";
import { __resetApiClientTestState } from "../../../services/apiClient";
import { createStrategyCopilotPreferences } from "../strategyCopilotPreferences";

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderStrategyLabHook() {
  return renderHook(() =>
    useStrategyLab({
      activeStrategyStorageKey: "active-strategy-test",
      defaultParameterSweep: DEFAULT_PARAMETER_SWEEP,
      defaultStrategyExperiment: DEFAULT_STRATEGY_EXPERIMENT,
      getUserStorageKey: (key) => key,
    })
  );
}

afterEach(() => {
  __resetApiRequestManagerForTests();
  __resetApiClientTestState();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Strategy Lab preview coordination", () => {
  it("debounces rapid builder changes and only requests the latest preview", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "csrf-token" });
      }
      return jsonResponse({ previewOnly: true, config: { strategy: "Latest" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderStrategyLabHook();

    act(() => {
      result.current.setStrategyExperimentForm((current) => ({ ...current, name: "First" }));
    });
    await act(() => vi.advanceTimersByTimeAsync(600));
    act(() => {
      result.current.setStrategyExperimentForm((current) => ({ ...current, name: "Latest" }));
    });
    await act(() => vi.advanceTimersByTimeAsync(1_199));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/preview"))).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    vi.useRealTimers();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/preview"))).toHaveLength(1);
    });
    const previewCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/preview"));
    expect(JSON.parse(previewCall[1].body).name).toBe("Latest");
  });

  it("keeps generated drafts unsaved until explicit approval", async () => {
    const generatedDraft = {
      status: "READY",
      canApprove: true,
      review: {
        title: "AI Swing Draft",
        description: "Generated from natural language.",
      },
      draft: {
        form: {
          name: "AI Swing Draft",
          description: "Generated from natural language.",
          status: "DRAFT",
          settings: {
            ...DEFAULT_STRATEGY_EXPERIMENT.settings,
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "30",
            strategyJson: {
              schemaVersion: "strategy-json/v1",
              metadata: {
                template: "Mean Reversion",
                objective: "max_risk_adjusted_return",
                compiler: "test",
                generatedAt: new Date(0).toISOString(),
                designNotes: [],
                builderState: null,
              },
              executable: {
                universe: {
                  type: "CUSTOM_SCREEN",
                  universeId: "",
                  universeName: "",
                  market: "US",
                },
                timeframe: { primary: "1D", entry: "1D" },
                entryRules: [{ indicator: "RSI", comparator: "CROSSES_ABOVE", value: 30 }],
                exitRules: [],
                positionSizing: {
                  method: "risk_per_trade",
                  riskPerTrade: 0.01,
                  previewCapital: 50000,
                },
                riskRules: [],
                filters: {
                  marketRegime: true,
                  news: false,
                  earnings: true,
                  marketHoursOnly: true,
                },
                execution: {
                  entryTiming: "next_bar",
                  confirmation: "close_confirmation",
                  scaleIn: false,
                  scaleOut: false,
                },
                validation: {
                  minimumTrades: 30,
                  minimumExpectancy: 0,
                  maxDrawdown: 12,
                  sharpeFloor: 1,
                  maxPositionSize: 8,
                  maxSectorExposure: 30,
                  maxDailyLoss: 3,
                },
                parameters: {
                  emaFast: 20,
                  emaSlow: 50,
                  rsiThreshold: 30,
                  atrStopMultiple: 1.5,
                  atrTakeProfitMultiple: 8,
                  trailingStopAtrMultiple: 2,
                  signalThreshold: 60,
                },
                weights: {
                  technical: 0.45,
                  regime: 0.25,
                  news: 0.15,
                  openai: 0.15,
                },
                envelope: {
                  sectors: [],
                  regimes: [],
                  instrumentTypes: [],
                  volBand: { min: 0, max: 0.03 },
                  liquidityFloor: 1000000,
                  holdingPeriodDays: 15,
                },
                regimeOverlays: {},
                allocationMatrix: {},
              },
              research: {
                hypothesis: "Draft",
                rationale: "Draft",
                notes: "",
                designNotes: {},
                assumptions: [],
              },
              evidence: {
                robustness: null,
                confidence: null,
                validation: null,
                deploymentScore: null,
              },
            },
            dslValidation: { isValid: true, warnings: [] },
          },
        },
      },
    };

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "csrf-token" });
      }
      if (String(url).includes("/api/strategy-experiments/generate-draft")) {
        return jsonResponse(generatedDraft);
      }
      if (String(url).includes("/api/strategy-experiments/preview")) {
        return jsonResponse({ previewOnly: true, config: { strategy: "Preview" } });
      }
      if (String(url).includes("/api/strategy-experiments") && options.method === "POST") {
        return jsonResponse({ id: "saved-1", runs: [] });
      }
      if (String(url).includes("/api/strategy-experiments")) {
        return jsonResponse({ experiments: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderStrategyLabHook();

    act(() => {
      result.current.setStrategyCopilotPrompt("Build a swing RSI strategy.");
    });

    await act(async () => {
      await result.current.handleGenerateStrategyDraft();
    });

    const draftCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/strategy-experiments/generate-draft")
    );
    expect(JSON.parse(draftCall[1].body)).toEqual({
      prompt: "Build a swing RSI strategy.",
      advancedMode: false,
    });

    expect(result.current.strategyCopilotDraft.result?.review?.title).toBe("AI Swing Draft");
    expect(
      fetchMock.mock.calls.filter(([url, options]) =>
        String(url).includes("/api/strategy-experiments") &&
        options?.method === "POST" &&
        !String(url).includes("generate-draft")
      )
    ).toHaveLength(0);

    await act(async () => {
      await result.current.handleApproveAndSaveGeneratedStrategyDraft();
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/strategy-experiments") && options?.method === "POST"
    );
    expect(saveCall).toBeTruthy();
    expect(JSON.parse(saveCall[1].body).name).toBe("AI Swing Draft");
  });

  it("submits advanced preferences only when Advanced Mode is enabled", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "csrf-token" });
      }
      if (String(url).includes("/api/strategy-experiments/generate-draft")) {
        return jsonResponse({
          status: "READY",
          canApprove: true,
          review: { title: "Draft", description: "Generated" },
          draft: { form: { name: "Draft", settings: {} } },
        });
      }
      if (String(url).includes("/api/strategy-experiments")) {
        return jsonResponse({ experiments: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderStrategyLabHook();

    act(() => {
      result.current.setStrategyCopilotPrompt("Build a robust momentum strategy.");
      result.current.setStrategyCopilotPreferences((current) => ({
        ...current,
        tradingStyle: "MOMENTUM",
        market: "US",
        riskLevel: "LOW",
        holdingPeriod: "DAYS_3_20",
        objectives: ["MAXIMIZE_SHARPE", "IMPROVE_MATRIX_ROBUSTNESS"],
        sectors: ["TECHNOLOGY"],
        constraints: {
          ...current.constraints,
          maxDrawdownTarget: "12",
          minimumLiquidity: "1000000",
          avoidEarningsPeriods: true,
        },
      }));
    });

    await act(async () => {
      await result.current.handleGenerateStrategyDraft();
    });

    const firstDraftCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/strategy-experiments/generate-draft")
    );
    expect(JSON.parse(firstDraftCall[1].body)).toEqual({
      prompt: "Build a robust momentum strategy.",
      advancedMode: false,
    });

    fetchMock.mockClear();

    act(() => {
      result.current.setStrategyCopilotPreferences((current) => ({
        ...current,
        advancedMode: true,
      }));
    });

    await act(async () => {
      await result.current.handleGenerateStrategyDraft();
    });

    const secondDraftCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/strategy-experiments/generate-draft")
    );
    expect(JSON.parse(secondDraftCall[1].body)).toEqual({
      prompt: "Build a robust momentum strategy.",
      advancedMode: true,
      preferences: {
        tradingStyle: "Momentum",
        market: "US Equities",
        riskLevel: "Low",
        holdingPeriod: "3-20 trading days",
        objectives: ["Maximize Sharpe", "Improve Matrix Robustness"],
        sectors: ["Technology"],
        constraints: {
          maxDrawdownTarget: 12,
          avoidEarningsPeriods: true,
          minimumLiquidity: 1000000,
        },
      },
    });
  });

  it("blocks invalid advanced combinations before sending the request", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "csrf-token" });
      }
      return jsonResponse({ experiments: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderStrategyLabHook();
    const invalidPreferences = createStrategyCopilotPreferences();
    invalidPreferences.advancedMode = true;
    invalidPreferences.sectors = ["NO_PREFERENCE", "TECHNOLOGY"];

    act(() => {
      result.current.setStrategyCopilotPrompt("Build a low-volatility strategy.");
      result.current.setStrategyCopilotPreferences(invalidPreferences);
    });

    await act(async () => {
      await result.current.handleGenerateStrategyDraft();
    });

    expect(result.current.strategyCopilotDraft.error).toMatch(/No preference/);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/strategy-experiments/generate-draft")
      )
    ).toBe(false);
  });
});
