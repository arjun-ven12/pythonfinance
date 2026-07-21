import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetApiRequestManagerForTests } from "../../services/apiRequestManager";
import { DEFAULT_STRATEGY_EXPERIMENT } from "./constants";
import StrategyLabPage from "./StrategyLabPage";
import {
  hydrateStrategyBuilderState,
  normalizeStrategyBuilderState,
  serializeStrategyBuilderState,
  validateStrategyJson,
} from "./utils/strategyJsonContract";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const experiment = {
  id: "strategy-1",
  name: "Momentum Lab",
  status: "TESTED",
  description: "Baseline momentum test",
  updatedAt: "2026-06-01T00:00:00.000Z",
  settingsJson: {},
  runs: [
    {
      id: "run-1",
      createdAt: "2026-06-01T00:00:00.000Z",
      returnPct: 12.34,
      cagr: 9.87,
      sharpe: 1.23,
      maxDrawdown: -8.5,
      winRate: 61,
      expectancy: 0.42,
      tradeCount: 12,
      settingsJson: {
        buy_and_hold_return_pct: 7.5,
        benchmark_return_pct: 6.1,
        equity_curve: [
          { date: "2026-01-01", equity: 100000, buy_and_hold: 100000, benchmark: 100000 },
          { date: "2026-02-01", equity: 112340, buy_and_hold: 107500, benchmark: 106100 },
        ],
        drawdown_curve: [
          { date: "2026-01-01", drawdown: 0 },
          { date: "2026-02-01", drawdown: -3.2 },
        ],
        completed_trade_log: [
          {
            entry_date: "2026-01-05",
            exit_date: "2026-01-20",
            side: "BUY",
            entry_price: 100,
            exit_price: 112,
            shares: 10,
            pnl: 120,
            return_pct: 12,
            holding_period: 15,
            exit_reason: "TAKE_PROFIT",
          },
        ],
      },
    },
  ],
  parameterSweeps: [
    {
      id: "sweep-1",
      totalRuns: 2,
      symbol: "AAPL",
      period: "2y",
      createdAt: "2026-06-02T00:00:00.000Z",
      rangesJson: { symbols: ["AAPL"] },
      results: [
        {
          id: "sweep-result-1",
          rank: 1,
          emaFast: 10,
          emaSlow: 50,
          rsiThreshold: 55,
          sharpe: 1.5,
          returnPct: 16,
          maxDrawdown: -7,
          winRate: 64,
        },
      ],
    },
  ],
};

const deploymentAllocation = {
  generatedAt: "2026-07-02T00:00:00.000Z",
  allocationMethod: "EQUAL_WEIGHT",
  activeSet: {
    owner: { experimentId: "strategy-1", name: "Momentum Lab", version: 1 },
    routedStrategies: [
      {
        experimentId: "strategy-1",
        name: "Momentum Lab",
        version: 1,
        routedSectors: ["Technology"],
        routedRegimes: ["BULL_LOW_VOL"],
      },
    ],
    pendingEvidence: [],
    sitOutContexts: [],
    activeStrategyVersions: [{ experimentId: "strategy-1", name: "Momentum Lab", version: 1 }],
  },
  strategies: [
    {
      experimentId: "strategy-1",
      strategyVersionId: "version-1",
      name: "Momentum Lab",
      version: 1,
      routedSectors: ["Technology"],
      routedRegimes: ["BULL_LOW_VOL"],
      readinessScore: 82,
      validationScore: 71,
      robustnessScore: 78,
      evidenceCount: 54,
      assignedCapitalPct: 50,
      maxAllocationPct: 60,
      expectedReturn: 12.34,
      expectedDrawdown: -8.5,
      sharpe: 1.23,
      volatility: 17,
      status: "READY",
    },
  ],
  matrix: {
    sectors: ["Technology"],
    regimes: ["BULL_LOW_VOL"],
    cells: [
      {
        key: "Technology::BULL_LOW_VOL",
        sector: "Technology",
        regime: "BULL_LOW_VOL",
        selectedExperimentId: "strategy-1",
        selectedStrategyVersionId: "version-1",
        strategyName: "Momentum Lab",
        allocationPct: 50,
        status: "ACTIVE",
        evidenceStatus: "Validated",
      },
    ],
  },
  simulation: {
    metrics: {
      expectedReturn: 12.34,
      expectedDrawdown: 8.5,
      sharpe: 1.23,
      capitalUsage: 50,
    },
    sectorExposure: [{ sector: "Technology", allocationPct: 50 }],
    regimeExposure: [{ regime: "BULL_LOW_VOL", allocationPct: 50 }],
  },
  rebalance: {
    frequency: "WEEKLY",
    maxDriftPct: 5,
    suggestions: [{ action: "No rebalance action suggested yet." }],
  },
  guardrails: {
    valid: true,
    config: {
      minimumTrades: 30,
      minimumValidationScore: 55,
      maxSectorExposurePct: 45,
    },
    violations: [],
  },
  auditLogs: [],
};

function response(body, ok = true) {
  return {
    headers: new Headers(),
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  };
}

function renderStrategyLab() {
  const onActiveStrategyChange = vi.fn();
  render(
    <StrategyLabPage
      activeStrategyStorageKey="active-strategy-test"
      getUserStorageKey={(key) => key}
      onActiveStrategyChange={onActiveStrategyChange}
      stockUniversesData={{ universes: [{ id: "universe-1", name: "Tech", members: [] }] }}
    />
  );
  return { onActiveStrategyChange };
}

afterEach(() => {
  cleanup();
  __resetApiRequestManagerForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("StrategyLabPage", () => {
  it("round-trips builder state through strategyJson without losing canonical state", () => {
    const builderState = normalizeStrategyBuilderState(DEFAULT_STRATEGY_EXPERIMENT);
    const strategyJson = serializeStrategyBuilderState(builderState);
    const reloadedState = hydrateStrategyBuilderState(strategyJson);

    expect(reloadedState).toEqual(builderState);
  });

  it("rejects malformed strategyJson with zod validation", () => {
    const strategyJson = serializeStrategyBuilderState(DEFAULT_STRATEGY_EXPERIMENT);
    const result = validateStrategyJson({
      ...strategyJson,
      executable: {
        ...strategyJson.executable,
        entryRules: [{ indicator: "MOON_PHASE", comparator: ">", value: 1 }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/unsupported/i);
  });

  it("renders standalone and loads strategy experiments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.includes("/api/strategy-experiments")) {
          return response({ experiments: [experiment] });
        }
        return response({ experimentId: "strategy-1", name: "Momentum Lab" });
      })
    );

    renderStrategyLab();

    expect(await screen.findByText("Unified Strategy Workspace")).toBeInTheDocument();
    expect(screen.getAllByText("Momentum Lab").length).toBeGreaterThan(0);
    expect(screen.getByText("1 saved")).toBeInTheDocument();
  });

  it("deduplicates Strategy Lab initial endpoint loads", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/api/strategy-experiments")) {
        return response({ experiments: [experiment] });
      }
      return response({ experimentId: "strategy-1", name: "Momentum Lab" });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStrategyLab();
    await screen.findByText("1 saved");

    const endpointCounts = [
      "/api/strategy-experiments",
      "/api/active-strategy",
      "/api/strategy-active-set",
      "/api/strategy-lifecycle",
      "/api/strategy-deployment-allocation",
      "/api/strategy-leaderboard",
    ].map((endpoint) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith(endpoint)).length
    );

    expect(endpointCounts).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("shows backtest metrics and enables compare mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.includes("/api/strategy-experiments")) {
          return response({ experiments: [experiment, { ...experiment, id: "strategy-2", name: "Mean Reversion" }] });
        }
        return response({ experimentId: "strategy-1", name: "Momentum Lab" });
      })
    );

    renderStrategyLab();

    fireEvent.click(await screen.findByRole("button", { name: /backtest & compare/i }));
    expect(screen.getAllByText("12.34%").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByLabelText(/mode/i)[0], { target: { value: "COMPARE" } });
    expect(screen.getByLabelText(/strategy b/i)).toBeInTheDocument();
    expect(screen.getByText(/compare strategies mode/i)).toBeInTheDocument();
  });

  it("runs a parameter sweep from the optimize section", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes("/api/auth/csrf")) {
        return response({ csrfToken: "csrf-test-token" });
      }
      if (url.includes("/parameter-sweep")) {
        return response({ sweep: { totalRuns: 3 } });
      }
      if (url.includes("/api/strategy-experiments")) {
        return response({ experiments: [experiment] });
      }
      return response({ experimentId: "strategy-1", name: "Momentum Lab" });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderStrategyLab();

    fireEvent.click(await screen.findByRole("button", { name: /optimize/i }));
    fireEvent.change(screen.getByLabelText(/selected strategy/i), {
      target: { value: "strategy-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run optimization/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/strategy-experiments/strategy-1/parameter-sweep"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("renders the deployment and allocation tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.includes("/api/strategy-deployment-allocation")) {
          return response(deploymentAllocation);
        }
        if (url.includes("/api/strategy-experiments")) {
          return response({ experiments: [experiment] });
        }
        return response({ experimentId: "strategy-1", name: "Momentum Lab" });
      })
    );

    renderStrategyLab();

    fireEvent.click(await screen.findByRole("button", { name: /deployment & allocation/i }));
    expect(screen.getByText(/route validated strategies and assign capital/i)).toBeInTheDocument();
    expect(screen.getByText(/strategy weights/i)).toBeInTheDocument();
    expect(screen.getByText(/sector × regime routing/i)).toBeInTheDocument();
  });

  it("shows AI transparency views inside the builder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.includes("/api/strategy-experiments/preview")) {
          return response({
            generatedAt: "2026-07-06T00:00:00.000Z",
            previewOnly: true,
            label: "Preview - bounded sample",
            config: { symbol: "AAPL", period: "6mo", strategy: "Momentum Lab" },
            metrics: { tradeCount: 4, returnPct: 7.2 },
          });
        }
        if (url.includes("/api/strategy-experiments")) {
          return response({ experiments: [experiment] });
        }
        return response({ experimentId: "strategy-1", name: "Momentum Lab" });
      })
    );

    renderStrategyLab();

    fireEvent.click(await screen.findByRole("button", { name: /builder/i }));

    expect(await screen.findByRole("heading", { name: /generated execution contract/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /json view/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /future code view/i })).toBeInTheDocument();
    expect(screen.getByText(/entry logic/i)).toBeInTheDocument();
  });
});
