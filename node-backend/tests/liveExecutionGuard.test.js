const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createLiveExecutionGuardService,
} = require("../features/execution/services/liveExecutionGuard.service");

function createPrismaStub(state = {}) {
  const db = {
    user: {
      findUnique: async ({ where }) => state.users?.find((user) => user.id === where.id) || null,
    },
    approvalRequest: {
      findFirst: async ({ where }) =>
        state.approvals?.find((approval) => approval.id === where.id && approval.userId === where.userId) ||
        null,
    },
    brokerConfig: {
      findUnique: async ({ where }) =>
        state.brokerConfigs?.find((config) => config.userId === where.userId) || null,
    },
    strategyVersion: {
      findFirst: async ({ where }) =>
        state.strategyVersions?.find((version) => {
          if (version.userId !== where.userId) return false;
          if (where.id && version.id !== where.id) return false;
          if (where.experimentId && version.experimentId !== where.experimentId) return false;
          if (where.deploymentStatus && version.deploymentStatus !== where.deploymentStatus) return false;
          return true;
        }) ||
        null,
      findMany: async ({ where, take }) => {
        const matches = (state.strategyVersions || []).filter((version) => {
          if (version.userId !== where.userId) return false;
          if (where.deploymentStatus && version.deploymentStatus !== where.deploymentStatus) return false;
          return true;
        });
        return typeof take === "number" ? matches.slice(0, take) : matches;
      },
    },
    brokerExecutionAudit: {
      count: async () => state.duplicateOrderCount || 0,
      findMany: async () => state.dailyLiveAudits || [],
    },
  };

  return {
    run: async (operation) => operation(db),
  };
}

function createGuard(overrides = {}) {
  const audits = [];
  const prisma = createPrismaStub({
    users: [{ id: "user-1", email: "user@example.com" }],
    approvals: [
      {
        id: "approval-1",
        userId: "user-1",
        status: "APPROVED",
        raw: { strategyVersionId: "strategy-version-1" },
        preTradeAnalysisJson: null,
      },
    ],
    brokerConfigs: [
      {
        userId: "user-1",
        executionMode: "PAPER_BROKER",
      },
    ],
    strategyVersions: [
      {
        id: "strategy-version-1",
        userId: "user-1",
        deploymentStatus: "ACTIVE",
      },
    ],
    duplicateOrderCount: 0,
    dailyLiveAudits: [],
    ...overrides.state,
  });

  const guard = createLiveExecutionGuardService({
    auditRepository: {
      create: async (entry) => {
        audits.push(entry);
        return entry;
      },
    },
    getBrokerCapabilities: async () => ({
      canConnect: true,
      canReadMarketData: true,
    }),
    getBrokerHealth: async () => ({
      connected: true,
      marketData: true,
      paperMode: true,
      lastHeartbeat: new Date().toISOString(),
    }),
    getBrokerReconciliation: async () => ({
      status: "CLEAN",
    }),
    getDefaultExecutionSettings: () => ({
      live_trading_enabled: false,
      broker_execution_mode: "READ_ONLY",
      max_live_trade_size: null,
      max_daily_live_notional: null,
    }),
    getRiskDashboard: async () => ({
      risk: {
        daily_loss_usage_pct: 0.25,
        weekly_loss_usage_pct: 0.4,
      },
    }),
    prisma,
    readUserSafetyStatus: async () => ({
      allow_trade: true,
      allow_new_trades: true,
      emergency_kill_switch: false,
      kill_switch_active: false,
      violations: [],
    }),
    readUserSetting: async (_userId, _key, defaults) => ({
      ...defaults,
      live_trading_enabled: true,
      broker_execution_mode: "PAPER_BROKER",
      max_live_trade_size: 10000,
      max_daily_live_notional: 25000,
    }),
    ...overrides.dependencies,
  });

  return { audits, guard };
}

async function assertBlocked(run, expectedMessage) {
  await assert.rejects(run, (error) => {
    assert.match(error.message, expectedMessage);
    return true;
  });
}

test("live guard blocks paper broker execution when broker mode stays read-only", async () => {
  const { audits, guard } = createGuard({
    state: {
      brokerConfigs: [
        {
          userId: "user-1",
          executionMode: "READ_ONLY",
        },
      ],
    },
    dependencies: {
      readUserSetting: async (_userId, _key, defaults) => ({
        ...defaults,
        live_trading_enabled: true,
        broker_execution_mode: "READ_ONLY",
        max_live_trade_size: 10000,
        max_daily_live_notional: 25000,
      }),
    },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /live trading is not enabled|mode is locked or read-only/i
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0].allowed, false);
});

test("live guard blocks without an approved approval", async () => {
  const { guard, audits } = createGuard({
    state: { approvals: [] },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "missing-approval",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /approved approval is required/i
  );
  assert.equal(audits.length, 1);
});

test("live guard allows manual broker paper orders without approval when explicitly configured", async () => {
  const { guard, audits } = createGuard({
    state: { approvals: [] },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    requireApproval: false,
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.strategyVersionId, null);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].allowed, true);
});

test("live guard accepts legacy strategy attribution from raw order payload", async () => {
  const { guard } = createGuard({
    state: {
      approvals: [
        {
          id: "approval-1",
          userId: "user-1",
          status: "APPROVED",
          raw: {
            order: {
              strategy_version_id: "strategy-version-1",
            },
          },
          preTradeAnalysisJson: null,
        },
      ],
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.strategyVersionId, "strategy-version-1");
});

test("live guard resolves active strategy version from experiment attribution", async () => {
  const { guard } = createGuard({
    state: {
      approvals: [
        {
          id: "approval-1",
          userId: "user-1",
          status: "APPROVED",
          raw: {},
          preTradeAnalysisJson: {
            latest_scan: {
              raw: {
                active_strategy_config: {
                  experiment_id: "experiment-1",
                  strategy_version_id: null,
                },
              },
            },
          },
        },
      ],
      strategyVersions: [
        {
          id: "strategy-version-9",
          userId: "user-1",
          experimentId: "experiment-1",
          version: 9,
          deploymentStatus: "ACTIVE",
        },
      ],
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.strategyVersionId, "strategy-version-9");
});

test("live guard accepts strategy attribution from legacy latest scan payloads", async () => {
  const { guard } = createGuard({
    state: {
      approvals: [
        {
          id: "approval-1",
          userId: "user-1",
          status: "APPROVED",
          raw: {},
          preTradeAnalysisJson: {
            latest_scan: {
              raw: {
                active_strategy_config: {
                  strategy_version_id: "strategy-version-1",
                },
              },
            },
          },
        },
      ],
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.strategyVersionId, "strategy-version-1");
});

test("live guard falls back to a single active deployed strategy for legacy approvals with strategy metadata", async () => {
  const { guard } = createGuard({
    state: {
      approvals: [
        {
          id: "approval-1",
          userId: "user-1",
          status: "APPROVED",
          raw: {
            strategy_name: "Momentum Lab",
            strategy_source: "Strategy Lab active experiment + python-engine/backtest.py research signal",
            strategy_audit: {
              strategy_name: "Momentum Lab",
              strategy_source: "Strategy Lab active experiment + python-engine/backtest.py research signal",
            },
          },
          preTradeAnalysisJson: {
            strategy_name: "Momentum Lab",
            strategy_source: "Strategy Lab active experiment + python-engine/backtest.py research signal",
          },
        },
      ],
      strategyVersions: [
        {
          id: "strategy-version-1",
          userId: "user-1",
          experimentId: "experiment-1",
          version: 3,
          deploymentStatus: "ACTIVE",
        },
      ],
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.strategyVersionId, "strategy-version-1");
});

test("live guard still blocks missing strategy attribution when no deterministic fallback exists", async () => {
  const { guard } = createGuard({
    state: {
      approvals: [
        {
          id: "approval-1",
          userId: "user-1",
          status: "APPROVED",
          raw: {
            strategy_name: "Momentum Lab",
            strategy_source: "Strategy Lab active experiment + python-engine/backtest.py research signal",
          },
          preTradeAnalysisJson: null,
        },
      ],
      strategyVersions: [
        {
          id: "strategy-version-1",
          userId: "user-1",
          experimentId: "experiment-1",
          version: 3,
          deploymentStatus: "ACTIVE",
        },
        {
          id: "strategy-version-2",
          userId: "user-1",
          experimentId: "experiment-2",
          version: 1,
          deploymentStatus: "ACTIVE",
        },
      ],
    },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /strategy version attribution is missing/i
  );
});

test("live guard falls back to default broker limits for legacy execution settings", async () => {
  const { guard } = createGuard({
    dependencies: {
      readUserSetting: async (_userId, _key, defaults) => ({
        execution_mode: "MANUAL_APPROVAL",
        auto_execute_confidence_threshold: 85,
        allow_trading_near_earnings: false,
        max_trade_size_for_auto_execution: 5000,
        allow_overnight_positions: true,
        pause_automation_during_major_macro_events: true,
        live_trading_enabled: defaults.live_trading_enabled,
        broker_execution_mode: "PAPER_BROKER",
      }),
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
});

test("live guard blocks when kill switch is on", async () => {
  const { guard } = createGuard({
    dependencies: {
      readUserSafetyStatus: async () => ({
        allow_trade: false,
        allow_new_trades: false,
        emergency_kill_switch: true,
        kill_switch_active: true,
        violations: [{ rule: "kill_switch" }],
      }),
    },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /safety manager is not healthy/i
  );
});

test("live guard blocks stale broker account snapshots", async () => {
  const { guard } = createGuard({
    dependencies: {
      getBrokerHealth: async () => ({
        connected: true,
        marketData: true,
        paperMode: true,
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
    },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /snapshot is stale/i
  );
});

test("live guard blocks reconciliation mismatches", async () => {
  const { guard } = createGuard({
    dependencies: {
      getBrokerReconciliation: async () => ({
        status: "WARNING",
      }),
    },
  });

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        estimatedNotional: 1000,
      }),
    /reconciliation is not clean/i
  );
});

test("live guard blocks trades above max live size", async () => {
  const { guard } = createGuard();

  await assertBlocked(
    () =>
      guard.assertLiveExecutionAllowed({
        userId: "user-1",
        mode: "PAPER_BROKER",
        approvalId: "approval-1",
        symbol: "AAPL",
        side: "BUY",
        quantity: 50,
        estimatedNotional: 15000,
      }),
    /exceeds max trade size/i
  );
});

test("live guard creates audit records for allowed attempts", async () => {
  const { guard, audits } = createGuard();

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].allowed, true);
  assert.equal(audits[0].mode, "PAPER_BROKER");
});

test("live guard allows paper broker manual override for 403 safety-style blocks", async () => {
  const { guard, audits } = createGuard({
    dependencies: {
      getBrokerReconciliation: async () => ({
        status: "WARNING",
      }),
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    approvalId: "approval-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
    manualOverride: true,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.manualOverrideApplied, true);
  assert.equal(result.overrideReasons.length, 1);
  assert.match(result.overrideReasons[0].blockedReason, /reconciliation is not clean/i);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].allowed, true);
});

test("live guard allows broker paper execution when positions are clean but open-order drift is only a warning", async () => {
  const { guard, audits } = createGuard({
    dependencies: {
      getBrokerReconciliation: async () => ({
        status: "CLEAN",
        syncScore: 100,
        openOrderDifferences: [
          {
            symbol: "AAPL",
            status: "MISSING_IN_APP",
            brokerOrderId: "2964408",
          },
        ],
        openOrderSyncStatus: "WARNING",
      }),
    },
  });

  const result = await guard.assertLiveExecutionAllowed({
    userId: "user-1",
    mode: "PAPER_BROKER",
    requireApproval: false,
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    estimatedNotional: 1000,
  });

  assert.equal(result.allowed, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].allowed, true);
});
