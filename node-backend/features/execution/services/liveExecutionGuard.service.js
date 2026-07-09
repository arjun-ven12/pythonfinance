const { ownedWhere, requireUserId } = require("../../../repositories/ownership");

const ALLOWED_BROKER_EXECUTION_MODES = new Set([
  "READ_ONLY",
  "PAPER_BROKER",
  "LIVE_DRY_RUN",
  "LIVE_SUPERVISED",
  "LIVE_LOCKED",
]);

function normalizeBrokerExecutionMode(value, fallback = "READ_ONLY") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return ALLOWED_BROKER_EXECUTION_MODES.has(normalized) ? normalized : fallback;
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isFreshTimestamp(value, freshnessMs) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= freshnessMs;
}

function createBlockedError(blockedReason, details = {}, statusCode = 403) {
  const error = new Error(blockedReason);
  error.statusCode = statusCode;
  error.blockedReason = blockedReason;
  error.details = details;
  return error;
}

function deriveStrategyVersionId(approval) {
  return (
    approval?.strategyVersionId ||
    approval?.strategy_version_id ||
    approval?.raw?.latest_scan?.strategyVersionId ||
    approval?.raw?.latest_scan?.strategy_version_id ||
    approval?.raw?.order?.strategyVersionId ||
    approval?.raw?.order?.strategy_version_id ||
    approval?.raw?.order?.strategyConfig?.strategyVersionId ||
    approval?.raw?.order?.strategyConfig?.strategy_version_id ||
    approval?.raw?.order?.strategy_config?.strategyVersionId ||
    approval?.raw?.order?.strategy_config?.strategy_version_id ||
    approval?.raw?.order?.active_strategy?.strategyVersionId ||
    approval?.raw?.order?.active_strategy?.strategy_version_id ||
    approval?.raw?.order?.active_strategy_config?.strategyVersionId ||
    approval?.raw?.order?.active_strategy_config?.strategy_version_id ||
    approval?.raw?.strategyVersionId ||
    approval?.raw?.strategy_version_id ||
    approval?.raw?.active_strategy?.strategyVersionId ||
    approval?.raw?.active_strategy?.strategy_version_id ||
    approval?.raw?.active_strategy_config?.strategyVersionId ||
    approval?.raw?.active_strategy_config?.strategy_version_id ||
    approval?.raw?.latest_scan?.raw?.strategyVersionId ||
    approval?.raw?.latest_scan?.raw?.strategy_version_id ||
    approval?.raw?.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    approval?.raw?.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    approval?.raw?.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    approval?.raw?.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    approval?.raw?.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    approval?.raw?.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    approval?.raw?.strategy_audit?.strategyVersionId ||
    approval?.raw?.strategy_audit?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.strategy?.versionId ||
    approval?.preTradeAnalysisJson?.strategy?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategy_config?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategy_config?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.strategy_config?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.strategy_config?.strategy_version_id ||
    approval?.preTradeAnalysisJson?.active_strategy_config?.strategyVersionId ||
    approval?.preTradeAnalysisJson?.active_strategy_config?.strategy_version_id ||
    null
  );
}

function deriveExperimentId(approval) {
  return (
    approval?.raw?.latest_scan?.raw?.active_strategy_config?.experimentId ||
    approval?.raw?.latest_scan?.raw?.active_strategy_config?.experiment_id ||
    approval?.raw?.latest_scan?.raw?.strategy_config?.experimentId ||
    approval?.raw?.latest_scan?.raw?.strategy_config?.experiment_id ||
    approval?.raw?.order?.active_strategy_config?.experimentId ||
    approval?.raw?.order?.active_strategy_config?.experiment_id ||
    approval?.raw?.order?.strategyConfig?.experimentId ||
    approval?.raw?.order?.strategyConfig?.experiment_id ||
    approval?.raw?.order?.strategy_config?.experimentId ||
    approval?.raw?.order?.strategy_config?.experiment_id ||
    approval?.raw?.active_strategy_config?.experimentId ||
    approval?.raw?.active_strategy_config?.experiment_id ||
    approval?.preTradeAnalysisJson?.strategy_config?.experimentId ||
    approval?.preTradeAnalysisJson?.strategy_config?.experiment_id ||
    approval?.preTradeAnalysisJson?.active_strategy_config?.experimentId ||
    approval?.preTradeAnalysisJson?.active_strategy_config?.experiment_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy_config?.experimentId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.active_strategy_config?.experiment_id ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategy_config?.experimentId ||
    approval?.preTradeAnalysisJson?.latest_scan?.raw?.strategy_config?.experiment_id ||
    null
  );
}

function hasLegacyStrategyMetadata(approval) {
  const raw = approval?.raw && typeof approval.raw === "object" ? approval.raw : {};
  const preTrade =
    approval?.preTradeAnalysisJson && typeof approval.preTradeAnalysisJson === "object"
      ? approval.preTradeAnalysisJson
      : {};
  const strategyAudit =
    raw?.strategy_audit && typeof raw.strategy_audit === "object"
      ? raw.strategy_audit
      : {};

  return Boolean(
    raw?.strategy_name ||
      raw?.strategy_source ||
      raw?.suggestion_basis ||
      strategyAudit?.strategy_name ||
      strategyAudit?.strategy_source ||
      strategyAudit?.suggestion_basis ||
      preTrade?.strategy_name ||
      preTrade?.strategy_source ||
      preTrade?.suggestion_basis ||
      preTrade?.strategy?.name
  );
}

function createLiveExecutionGuardService({
  auditRepository,
  getDefaultExecutionSettings,
  getBrokerCapabilities,
  getBrokerHealth,
  getBrokerReconciliation,
  getRiskDashboard,
  prisma,
  readUserSafetyStatus,
  readUserSetting,
}) {
  async function recordAuditAttempt(input, outcome) {
    if (!auditRepository) return null;
    const side = ["BUY", "SELL"].includes(String(input.side || "").toUpperCase())
      ? String(input.side).toUpperCase()
      : "BUY";
    return auditRepository.create({
      userId: input.userId,
      approvalId: input.approvalId || null,
      symbol: String(input.symbol || "").toUpperCase(),
      side,
      quantity: Number(input.quantity || 0),
      mode: normalizeBrokerExecutionMode(input.mode),
      allowed: Boolean(outcome.allowed),
      blockedReason: outcome.blockedReason || null,
      requestPayload: outcome.requestPayload || null,
      brokerResponse: outcome.brokerResponse || null,
    });
  }

  async function assertLiveExecutionAllowed(input) {
    const userId = requireUserId(input.userId);
    const symbol = String(input.symbol || "").trim().toUpperCase();
    const side = String(input.side || "").trim().toUpperCase();
    const quantity = toNumber(input.quantity, 0);
    const estimatedNotional = toNumber(input.estimatedNotional, 0);
    const mode = normalizeBrokerExecutionMode(input.mode);
    const manualOverride = Boolean(input.manualOverride);
    const requireApproval = input.requireApproval !== false;
    const overrideReasons = [];
    const requestPayload = {
      approvalId: input.approvalId || null,
      brokerAccountId: input.brokerAccountId || null,
      estimatedNotional,
      manualOverride,
      mode,
      quantity,
      side,
      symbol,
    };

    const fail = async (
      blockedReason,
      details = {},
      statusCode = 403,
      { allowManualOverride = false } = {}
    ) => {
      if (
        manualOverride &&
        mode === "PAPER_BROKER" &&
        statusCode === 403 &&
        allowManualOverride
      ) {
        overrideReasons.push({
          blockedReason,
          details,
        });
        return;
      }

      await recordAuditAttempt(
        {
          ...input,
          mode,
          quantity,
          side,
          symbol,
          userId,
        },
        {
          allowed: false,
          blockedReason,
          requestPayload,
          brokerResponse: details,
        }
      );
      throw createBlockedError(blockedReason, details, statusCode);
    };

    if (!symbol || !["BUY", "SELL"].includes(side) || quantity <= 0) {
      await fail("Live execution request is missing valid trade details.", {
        quantity,
        side,
        symbol,
      }, 400);
    }

    const user = await prisma.run((db) =>
      db.user.findUnique({ where: { id: userId } })
    );

    if (!user) {
      await fail("Live execution blocked: user not found.", {}, 404);
    }

    const [
      approval,
      brokerConfig,
      storedExecutionSettings,
      safetyStatus,
      health,
      capabilities,
      reconciliation,
      riskDashboard,
      duplicateOrderCount,
      dailyLiveAudits,
    ] = await Promise.all([
      input.approvalId
        ? prisma.run((db) =>
            db.approvalRequest.findFirst({
              where: ownedWhere(userId, { id: input.approvalId }),
            })
          )
        : Promise.resolve(null),
      prisma.run((db) =>
        db.brokerConfig.findUnique({ where: { userId } })
      ),
      readUserSetting(userId, "execution_settings", getDefaultExecutionSettings()),
      readUserSafetyStatus(userId),
      getBrokerHealth(userId),
      getBrokerCapabilities(userId),
      getBrokerReconciliation(userId),
      getRiskDashboard(userId),
      prisma.run((db) =>
        db.brokerExecutionAudit.count({
          where: {
            userId,
            symbol,
            side,
            allowed: true,
            createdAt: {
              gte: new Date(Date.now() - 10 * 60 * 1000),
            },
          },
        })
      ),
      prisma.run((db) =>
        db.brokerExecutionAudit.findMany({
          where: {
            userId,
            allowed: true,
            mode: { in: ["LIVE_DRY_RUN", "LIVE_SUPERVISED"] },
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          select: {
            requestPayload: true,
          },
        })
      ),
    ]);

    const executionSettings = {
      ...getDefaultExecutionSettings(),
      ...(storedExecutionSettings || {}),
    };

    const configuredMode = normalizeBrokerExecutionMode(
      brokerConfig?.executionMode ||
        executionSettings?.broker_execution_mode ||
        "READ_ONLY"
    );
    const isPaperBrokerRequest = mode === "PAPER_BROKER";

    if (mode === "READ_ONLY" || configuredMode === "READ_ONLY" || configuredMode === "LIVE_LOCKED") {
      await fail(`${isPaperBrokerRequest ? "Paper broker" : "Live execution"} blocked: broker mode is locked or read-only.`, {
        configuredMode,
        requestedMode: mode,
      });
    }

    if (configuredMode !== mode) {
      await fail(`${isPaperBrokerRequest ? "Paper broker" : "Live execution"} blocked: requested mode does not match broker configuration.`, {
        configuredMode,
        requestedMode: mode,
      });
    }

    if (!isPaperBrokerRequest && !executionSettings?.live_trading_enabled) {
      await fail("Live execution blocked: live trading is not enabled.", {
        configuredMode,
      });
    }

    if (!health?.connected || !capabilities?.canConnect) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: broker is not connected.`, {
        health,
      });
    }

    if (!isFreshTimestamp(health?.lastHeartbeat || brokerConfig?.config?.last_checked_at, 5 * 60 * 1000)) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: broker account snapshot is stale.`, {
        health,
      });
    }

    if (isPaperBrokerRequest) {
      if (health?.paperMode !== true) {
        await fail("Paper broker execution blocked: broker account is not confirmed paper.", {
          health,
        });
      }
    } else if (health?.paperMode !== false) {
      await fail("Live execution blocked: broker account mode is not confirmed live.", {
        health,
      });
    }

    if (requireApproval && !approval) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: approved approval is required.`, {
        approvalId: input.approvalId || null,
      });
    }

    if (requireApproval && (approval.userId !== userId || approval.status !== "APPROVED")) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: approval is not approved for this user.`, {
        approvalId: approval.id,
        approvalStatus: approval.status,
      });
    }

    let strategyVersionId = requireApproval ? deriveStrategyVersionId(approval) : null;
    const experimentId = requireApproval ? deriveExperimentId(approval) : null;
    let strategyVersion = null;

    if (strategyVersionId) {
      strategyVersion = await prisma.run((db) =>
        db.strategyVersion.findFirst({
          where: ownedWhere(userId, { id: strategyVersionId }),
        })
      );
    }

    if (!strategyVersion && experimentId) {
      strategyVersion = await prisma.run((db) =>
        db.strategyVersion.findFirst({
          where: ownedWhere(userId, {
            experimentId,
            deploymentStatus: "ACTIVE",
          }),
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        })
      );
      strategyVersionId = strategyVersion?.id || strategyVersionId;
    }

    if (!strategyVersion && !strategyVersionId && !experimentId && hasLegacyStrategyMetadata(approval)) {
      const activeVersions = await prisma.run((db) =>
        db.strategyVersion.findMany({
          where: ownedWhere(userId, {
            deploymentStatus: "ACTIVE",
          }),
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 2,
        })
      );

      if (activeVersions.length === 1) {
        strategyVersion = activeVersions[0];
        strategyVersionId = strategyVersion.id;
      }
    }

    if (requireApproval && !strategyVersionId) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: strategy version attribution is missing.`, {
        approvalId: approval?.id || null,
        experimentId,
      });
    }

    if (
      requireApproval &&
      (!strategyVersion || strategyVersion.deploymentStatus !== "ACTIVE")
    ) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: strategy version is not deployable.`, {
        strategyVersionId,
        experimentId,
        deploymentStatus: strategyVersion?.deploymentStatus || null,
      });
    }

    const killSwitchOn = Boolean(
      safetyStatus?.kill_switch_active ||
        safetyStatus?.emergency_kill_switch ||
        !safetyStatus?.allow_trade ||
        !safetyStatus?.allow_new_trades
    );

    if (killSwitchOn || (safetyStatus?.violations || []).length > 0) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: safety manager is not healthy.`, {
        safetyStatus,
      }, 403, { allowManualOverride: true });
    }

    const dailyLossUsage = toNumber(riskDashboard?.risk?.daily_loss_usage_pct, 0);
    const weeklyLossUsage = toNumber(riskDashboard?.risk?.weekly_loss_usage_pct, 0);

    if (dailyLossUsage >= 1) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: daily loss limit exceeded.`, {
        dailyLossUsage,
      }, 403, { allowManualOverride: true });
    }

    if (weeklyLossUsage >= 1) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: weekly loss limit exceeded.`, {
        weeklyLossUsage,
      }, 403, { allowManualOverride: true });
    }

    const maxLiveTradeSize = toNumber(
      executionSettings?.max_live_trade_size ??
        executionSettings?.max_trade_size_for_auto_execution,
      null
    );

    if (!(maxLiveTradeSize > 0)) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: max trade size is not configured.`, {
        maxLiveTradeSize,
      });
    }

    if (estimatedNotional > maxLiveTradeSize) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: estimated notional exceeds max trade size.`, {
        estimatedNotional,
        maxLiveTradeSize,
      }, 403, { allowManualOverride: true });
    }

    const maxDailyLiveNotional = toNumber(
      executionSettings?.max_daily_live_notional ??
        (maxLiveTradeSize > 0 ? maxLiveTradeSize * 5 : null),
      null
    );

    if (!(maxDailyLiveNotional > 0)) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: max daily notional is not configured.`, {
        maxDailyLiveNotional,
      });
    }

    const alreadyUsedNotional = (dailyLiveAudits || []).reduce((sum, audit) => {
      return sum + toNumber(audit?.requestPayload?.estimatedNotional, 0);
    }, 0);

    if (alreadyUsedNotional + estimatedNotional > maxDailyLiveNotional) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: daily notional limit exceeded.`, {
        alreadyUsedNotional,
        estimatedNotional,
        maxDailyLiveNotional,
      }, 403, { allowManualOverride: true });
    }

    if (reconciliation?.status !== "CLEAN") {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: broker reconciliation is not clean.`, {
        reconciliation,
      }, 403, { allowManualOverride: true });
    }

    const brokerMarketDataAvailable =
      health?.marketDataAvailable ?? health?.marketData ?? capabilities?.canReadMarketData;

    if (!brokerMarketDataAvailable || !capabilities?.canReadMarketData) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: market data is not fresh enough.`, {
        capabilities,
        health,
      }, 403, { allowManualOverride: true });
    }

    const openOrders = Array.isArray(health?.openOrders)
      ? health.openOrders
      : [];
    const duplicateOpenOrder = openOrders.some((order) => {
      const orderSymbol = String(order.symbol || "").toUpperCase();
      const orderSide = String(order.side || "").toUpperCase();
      return orderSymbol === symbol && orderSide === side;
    });

    if (duplicateOpenOrder || duplicateOrderCount > 0) {
      await fail(`${isPaperBrokerRequest ? "Paper broker execution" : "Live execution"} blocked: duplicate pending order detected.`, {
        duplicateOpenOrder,
        duplicateOrderCount,
      }, 403, { allowManualOverride: true });
    }

    await recordAuditAttempt(
      {
        ...input,
        mode,
        quantity,
        side,
        symbol,
        userId,
      },
        {
          allowed: true,
          requestPayload,
          brokerResponse: {
            configuredMode,
            manualOverrideApplied: manualOverride && mode === "PAPER_BROKER",
            overrideReasons,
            strategyVersionId,
          },
        }
      );

    return {
      allowed: true,
      configuredMode,
      manualOverrideApplied: manualOverride && mode === "PAPER_BROKER",
      overrideReasons,
      strategyVersionId,
    };
  }

  return {
    assertLiveExecutionAllowed,
    normalizeBrokerExecutionMode,
  };
}

module.exports = {
  ALLOWED_BROKER_EXECUTION_MODES,
  createBlockedError,
  createLiveExecutionGuardService,
  normalizeBrokerExecutionMode,
};
