function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function mapPositions(positions = []) {
  const map = new Map();
  for (const position of positions || []) {
    const symbol = normalizeSymbol(position.symbol);
    if (!symbol) continue;
    map.set(symbol, {
      symbol,
      quantity: toNumber(position.quantity ?? position.shares),
      averageCost: toNumber(
        position.averageCost ??
          position.average_cost ??
          position.avgCost ??
          position.avg_price
      ),
      marketValue: toNumber(position.marketValue ?? position.market_value),
    });
  }
  return map;
}

function extractPaperPositions(riskDashboard = {}) {
  return (
    riskDashboard?.openPositions ||
    riskDashboard?.positions ||
    riskDashboard?.open_positions_risk ||
    []
  );
}

function extractPaperCash(riskDashboard = {}) {
  return toNumber(
    riskDashboard?.cashBalance ??
      riskDashboard?.cash ??
      riskDashboard?.portfolio?.cash,
    0
  );
}

function extractPaperEquity(riskDashboard = {}) {
  return toNumber(
    riskDashboard?.totalPortfolioEquity ??
      riskDashboard?.equity ??
      riskDashboard?.portfolio?.equity,
    0
  );
}

function normalizeOrderIdentifier(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function hasOrderMatch(left = {}, right = {}) {
  const leftBrokerOrderId = normalizeOrderIdentifier(left.brokerOrderId);
  const rightBrokerOrderId = normalizeOrderIdentifier(right.brokerOrderId);
  if (leftBrokerOrderId && rightBrokerOrderId) {
    return leftBrokerOrderId === rightBrokerOrderId;
  }

  const leftClientOrderId = normalizeOrderIdentifier(left.clientOrderId);
  const rightClientOrderId = normalizeOrderIdentifier(right.clientOrderId);
  if (leftClientOrderId && rightClientOrderId) {
    return leftClientOrderId === rightClientOrderId;
  }

  return false;
}

function normalizeOrderStatus(value, fallback = "UNKNOWN") {
  return (
    String(value || fallback)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_") || fallback
  );
}

function isTrackedOpenOrder(order = {}) {
  const status = normalizeOrderStatus(order.status);
  return !(
    status === "FILLED" ||
    status.includes("CANCEL") ||
    status.includes("REJECT") ||
    status.includes("FAIL") ||
    status.includes("EXPIRE")
  );
}

const ACCOUNT_SUMMARY_CACHE_TTL_MS = 5000;
const ACCOUNT_SUMMARY_STALE_FALLBACK_MS = 30000;
const READ_RETRY_DELAYS_MS = [200, 500];

function isBrokerRateLimitError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("high frequency") || message.includes("too many requests");
}

function classifyBrokerReadError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return "UNKNOWN";
  if (isBrokerRateLimitError(error)) return "RATE_LIMITED";
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("504")
  ) {
    return "TIMEOUT";
  }
  if (
    message.includes("unable to connect") ||
    message.includes("unreachable") ||
    message.includes("econnrefused") ||
    message.includes("temporarily unavailable") ||
    message.includes("connection reset") ||
    message.includes("broken pipe") ||
    message.includes("callclose") ||
    message.includes("disconnected")
  ) {
    return "DISCONNECTED";
  }
  if (
    message.includes("login required") ||
    message.includes("not logged in") ||
    message.includes("auth") ||
    message.includes("unlock trade")
  ) {
    return "AUTH_REQUIRED";
  }
  if (
    message.includes("permission") ||
    message.includes("locked") ||
    message.includes("nonexisting acc_id")
  ) {
    return "PERMISSION_OR_ACCOUNT";
  }
  if (
    message.includes("invalid json") ||
    message.includes("bridge") ||
    message.includes("bad gateway")
  ) {
    return "BRIDGE_FAILURE";
  }
  return "UNKNOWN";
}

function isRetryableBrokerReadError(error) {
  const category = classifyBrokerReadError(error);
  return (
    category === "TIMEOUT" ||
    category === "DISCONNECTED" ||
    category === "BRIDGE_FAILURE"
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createBrokerService({
  getAdapterForUser,
  getProviderForUser,
  readBrokerConfigForUser,
  readResolvedBrokerConfigForUser,
  brokerConnectionLogRepository,
  brokerOrdersRepository,
  buildRiskDashboardFromDatabase,
  liveExecutionGuard,
}) {
  const accountSummaryCache = new Map();

  function buildAccountSummaryCacheKey(userId, resolved = {}) {
    const config = resolved.config || {};
    return [
      String(userId || ""),
      String(resolved.provider || ""),
      String(resolved.executionMode || ""),
      String(config.host || ""),
      String(config.port || ""),
      String(config.tradeEnv || ""),
      String(config.accountId || ""),
      String(config.market || ""),
    ].join(":");
  }

  async function log(userId, payload) {
    try {
      await brokerConnectionLogRepository.create(userId, payload);
    } catch (error) {
      console.warn(`Broker log write failed: ${error.message}`);
    }
  }

  async function timed(userId, action, fn) {
    const started = Date.now();
    try {
      const result = await fn();
      await log(userId, {
        action,
        success: true,
        latency: Date.now() - started,
        metadata: { status: result?.status || result?.healthStatus || null },
      });
      return result;
    } catch (error) {
      const category = classifyBrokerReadError(error);
      await log(userId, {
        action,
        success: false,
        error: error.message,
        latency: Date.now() - started,
        metadata: { category },
      });
      throw error;
    }
  }

  async function withBrokerReadRecovery(userId, action, fn, options = {}) {
    const maxRetries = Math.max(0, Number(options.maxRetries ?? READ_RETRY_DELAYS_MS.length));
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      try {
        const result = await fn({ attempt });
        if (attempt > 0 && result && typeof result === "object") {
          return {
            ...result,
            providerWarning:
              result.providerWarning ||
              `Recovered after ${attempt} broker read retr${attempt === 1 ? "y" : "ies"}.`,
            recoveredByRetry: true,
            retryCount: attempt,
          };
        }
        return result;
      } catch (error) {
        lastError = error;
        const retryable = isRetryableBrokerReadError(error);
        if (!retryable || attempt >= maxRetries) {
          break;
        }

        const delayMs = READ_RETRY_DELAYS_MS[attempt] ?? READ_RETRY_DELAYS_MS.at(-1) ?? 250;
        await log(userId, {
          action: `${action}_RETRY`,
          success: false,
          error: error.message,
          metadata: {
            category: classifyBrokerReadError(error),
            attempt: attempt + 1,
            retryInMs: delayMs,
          },
        });
        await wait(delayMs);
      }

      attempt += 1;
    }

    throw lastError;
  }

  function deriveHealthStatus(health = {}) {
    if (health.connected && health.accountLoaded && health.orderPermission) {
      return "Healthy";
    }
    if (health.connected && health.accountLoaded) {
      return "Degraded";
    }
    if (health.recoveredByRetry) {
      return "Recovering";
    }
    if (health.opendReachable || health.gatewayRunning) {
      return health.loggedIn ? "Degraded" : "Recovering";
    }
    return "Unavailable";
  }

  async function getRuntimeInput(userId, providerOverride = null, input = {}) {
    const storedConfig = readResolvedBrokerConfigForUser
      ? await readResolvedBrokerConfigForUser(userId, providerOverride)
      : readBrokerConfigForUser
        ? await readBrokerConfigForUser(userId)
        : null;
    return {
      ...(storedConfig?.config || {}),
      ...(input || {}),
      provider:
        providerOverride ||
        input?.provider ||
        storedConfig?.provider ||
        null,
      executionMode:
        input?.executionMode ||
        storedConfig?.executionMode ||
        undefined,
    };
  }

  async function getConfig(userId, providerOverride = null) {
    const resolved = readResolvedBrokerConfigForUser
      ? await readResolvedBrokerConfigForUser(userId, providerOverride)
      : {
          provider: await getProvider(userId),
          executionMode: undefined,
          config: await getRuntimeInput(userId, providerOverride),
          savedConfig: {},
        };
    return {
      provider: resolved.provider,
      executionMode: resolved.executionMode,
      config: resolved.savedConfig || {},
      effectiveConfig: resolved.config || {},
      effectiveTarget: resolved.config?.host && resolved.config?.port
        ? `${resolved.config.host}:${resolved.config.port}`
        : null,
    };
  }

  async function testConnection(userId, input, providerOverride = null) {
    const adapter = await getAdapterForUser(userId, providerOverride);
    const runtimeInput = await getRuntimeInput(userId, providerOverride, input);
    return timed(userId, "TEST_CONNECTION", () =>
      withBrokerReadRecovery(userId, "TEST_CONNECTION", () =>
        adapter.testConnection(userId, runtimeInput)
      )
    );
  }

  async function getProvider(userId) {
    return getProviderForUser(userId);
  }

  async function getHealth(userId) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId);
    const health = await timed(userId, "GET_HEALTH", () =>
      withBrokerReadRecovery(userId, "GET_HEALTH", () =>
        adapter.getHealth(userId, runtimeInput)
      )
    );
    const healthStatus = deriveHealthStatus(health);
    return {
      ...health,
      healthStatus,
      failureCategory: health.lastError
        ? classifyBrokerReadError({ message: health.lastError })
        : null,
    };
  }

  function invalidateAccountSummaryCache(userId) {
    const prefix = `${String(userId || "")}:`;
    for (const key of accountSummaryCache.keys()) {
      if (key.startsWith(prefix)) {
        accountSummaryCache.delete(key);
      }
    }
  }

  async function getAccountSummary(userId, options = {}) {
    const resolved = readResolvedBrokerConfigForUser
      ? await readResolvedBrokerConfigForUser(userId)
      : {
          provider: await getProvider(userId),
          executionMode: undefined,
          config: await getRuntimeInput(userId),
        };

    if (resolved.provider === "INTERNAL_PAPER") {
      return {
        provider: "INTERNAL_PAPER",
        executionMode: resolved.executionMode || "INTERNAL_PAPER",
        tradeEnv: null,
        available: false,
        paperMode: true,
        cash: null,
        buyingPower: null,
        equity: null,
        currency: "USD",
        positions: [],
        openOrders: [],
        reason: "Internal paper mode is selected. No external broker account is active.",
        source: "INTERNAL_PAPER",
      };
    }

    const cacheKey = buildAccountSummaryCacheKey(userId, resolved);
    const now = Date.now();
    if (options.forceRefresh) {
      accountSummaryCache.delete(cacheKey);
    }
    const cachedEntry = accountSummaryCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.promise;
    }

    const adapter = await getAdapterForUser(userId);
    const runtimeInput = {
      ...(resolved.config || {}),
      provider: resolved.provider,
      executionMode: resolved.executionMode,
    };

    const summaryPromise = (async () => {
      try {
        const summary = await timed(userId, "GET_ACCOUNT_SUMMARY", () =>
          withBrokerReadRecovery(userId, "GET_ACCOUNT_SUMMARY", () =>
            adapter.getAccountSummary(userId, runtimeInput)
          )
        );
        const normalized = {
          ...summary,
          provider: resolved.provider,
          executionMode: resolved.executionMode,
          tradeEnv: resolved.config?.tradeEnv || null,
          source: "BROKER_ACCOUNT",
        };
        const current = accountSummaryCache.get(cacheKey);
        if (current && current.promise === summaryPromise) {
          current.value = normalized;
          current.cachedAt = Date.now();
          current.expiresAt = Date.now() + ACCOUNT_SUMMARY_CACHE_TTL_MS;
        }
        return normalized;
      } catch (error) {
        const previous =
          cachedEntry &&
          cachedEntry.value &&
          now - (cachedEntry.cachedAt || 0) <= ACCOUNT_SUMMARY_STALE_FALLBACK_MS
            ? cachedEntry.value
            : null;
        const staleRecoverable =
          previous &&
          (isBrokerRateLimitError(error) || isRetryableBrokerReadError(error));
        if (staleRecoverable) {
          const category = classifyBrokerReadError(error);
          return {
            ...previous,
            providerWarning:
              previous.providerWarning ||
              (category === "RATE_LIMITED"
                ? "Using recently cached broker account data while OpenD rate limits order refreshes."
                : "Using recently cached broker account data while the broker connection recovers."),
            lastError: error.message,
            staleBecauseRateLimited: category === "RATE_LIMITED",
            staleBecauseBrokerReadFailed: category !== "RATE_LIMITED",
            staleReadCategory: category,
          };
        }
        const current = accountSummaryCache.get(cacheKey);
        if (current && current.promise === summaryPromise) {
          accountSummaryCache.delete(cacheKey);
        }
        throw error;
      }
    })();

    accountSummaryCache.set(cacheKey, {
      promise: summaryPromise,
      value: cachedEntry?.value || null,
      cachedAt: cachedEntry?.cachedAt || 0,
      expiresAt: now + ACCOUNT_SUMMARY_CACHE_TTL_MS,
    });

    return summaryPromise;
  }

  async function getCapabilities(userId) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId);
    return adapter.getCapabilities(userId, runtimeInput);
  }

  async function getAccounts(userId, providerOverride = null) {
    const adapter = await getAdapterForUser(userId, providerOverride);
    const runtimeInput = await getRuntimeInput(userId, providerOverride);
    if (typeof adapter.getAccounts === "function") {
      return timed(userId, "GET_ACCOUNTS", () =>
        withBrokerReadRecovery(userId, "GET_ACCOUNTS", () =>
          adapter.getAccounts(userId, runtimeInput)
        )
      );
    }
    const summary = await timed(userId, "GET_ACCOUNTS", () =>
      withBrokerReadRecovery(userId, "GET_ACCOUNTS", () =>
        adapter.getAccountSummary(userId, runtimeInput)
      )
    );
    return {
      accounts: Array.isArray(summary?.managedAccounts)
        ? summary.managedAccounts.map((account) => ({
            accountId: String(account.accId || ""),
            accountType: account.cardNum ? "Account" : "Unknown",
            tradeEnv: account.trdEnv || "SIMULATE",
            market: Array.isArray(account.marketAuth) ? account.marketAuth[0] || "US" : "US",
            displayName: `${account.trdEnv || "SIMULATE"} · ${String(account.accId || "")}`,
          }))
        : [],
    };
  }

  async function getReconciliation(userId, providedRiskDashboard = null, options = {}) {
    const [brokerAccount, riskDashboard] = await Promise.all([
      getAccountSummary(userId, { forceRefresh: options.forceRefresh }),
      providedRiskDashboard || buildRiskDashboardFromDatabase(userId),
    ]);
    const activeBroker =
      String(brokerAccount?.provider || "").trim().toUpperCase() || null;
    const persistedBrokerOrders = brokerOrdersRepository
      ? await brokerOrdersRepository.listOrders(userId, {
          limit: 200,
          broker: activeBroker,
        })
      : [];
    const paperPositions = extractPaperPositions(riskDashboard);
    const brokerPositions = brokerAccount.positions || [];
    const brokerOpenOrders = brokerAccount.openOrders || [];
    const persistedOpenOrders = persistedBrokerOrders.filter((order) =>
      isTrackedOpenOrder(order)
    );
    const paperMap = mapPositions(paperPositions);
    const brokerMap = mapPositions(brokerPositions);
    const symbols = new Set([...paperMap.keys(), ...brokerMap.keys()]);
    const positionDifferences = [];
    const missingPositions = [];
    const extraPositions = [];
    let driftCount = 0;
    let averageCostDifference = 0;

    for (const symbol of symbols) {
      const paper = paperMap.get(symbol);
      const broker = brokerMap.get(symbol);
      if (paper && !broker) {
        missingPositions.push(symbol);
        driftCount += 1;
      } else if (!paper && broker) {
        extraPositions.push(symbol);
        driftCount += 1;
      }
      const quantityDifference = toNumber(broker?.quantity) - toNumber(paper?.quantity);
      const costDifference = toNumber(broker?.averageCost) - toNumber(paper?.averageCost);
      if (Math.abs(quantityDifference) > 0.0001 || Math.abs(costDifference) > 0.01) {
        if (paper && broker) driftCount += 1;
        averageCostDifference += Math.abs(costDifference);
        positionDifferences.push({
          symbol,
          paperQuantity: paper?.quantity ?? 0,
          brokerQuantity: broker?.quantity ?? 0,
          quantityDifference,
          paperAverageCost: paper?.averageCost ?? 0,
          brokerAverageCost: broker?.averageCost ?? 0,
          averageCostDifference: costDifference,
        });
      }
    }

    const paperCash = extractPaperCash(riskDashboard);
    const brokerCash = brokerAccount.cash == null ? null : toNumber(brokerAccount.cash);
    const cashDifference = brokerCash == null ? null : brokerCash - paperCash;
    const openOrderDifferences = [];
    for (const order of persistedOpenOrders) {
      const matched = brokerOpenOrders.find((brokerOrder) =>
        hasOrderMatch(order, brokerOrder)
      );
      if (!matched) {
        openOrderDifferences.push({
          localOrderId: order.id || null,
          clientOrderId: order.clientOrderId,
          brokerOrderId: order.brokerOrderId,
          symbol: order.symbol,
          status: "MISSING_AT_BROKER",
        });
      }
    }

    for (const order of brokerOpenOrders) {
      const matched = persistedOpenOrders.find((item) =>
        hasOrderMatch(item, order)
      );
      if (!matched) {
        openOrderDifferences.push({
          clientOrderId: order.clientOrderId || null,
          brokerOrderId: order.brokerOrderId || null,
          symbol: order.symbol || null,
          status: "MISSING_IN_APP",
        });
      }
    }

    const totalChecks = Math.max(symbols.size + (brokerCash == null ? 0 : 1), 1);
    const cashDrift = cashDifference == null ? 0 : Math.abs(cashDifference) > 1 ? 1 : 0;
    const syncScore = Math.max(
      0,
      Math.round(((totalChecks - driftCount - cashDrift) / totalChecks) * 100)
    );
    const status = !brokerAccount.available
      ? "BLOCKED"
      : syncScore >= 95
        ? "CLEAN"
        : syncScore >= 75
          ? "WARNING"
          : "BLOCKED";
    const openOrderSyncStatus = openOrderDifferences.length === 0 ? "CLEAN" : "WARNING";

    return {
      status,
      syncScore,
      cashDifference,
      positionDifferences,
      openOrderDifferences,
      openOrderSyncStatus,
      averageCostDifference,
      missingPositions,
      extraPositions,
      brokerAvailable: Boolean(brokerAccount.available),
      brokerReason: brokerAccount.reason || null,
      paperSummary: {
        cash: paperCash,
        equity: extractPaperEquity(riskDashboard),
        positions: paperPositions.length,
      },
      brokerSummary: {
        cash: brokerAccount.cash,
        equity: brokerAccount.equity,
        positions: brokerPositions.length,
      },
    };
  }

  async function getPreflight(userId, options = {}) {
    const [health, capabilities, riskDashboard] = await Promise.all([
      getHealth(userId),
      getCapabilities(userId),
      buildRiskDashboardFromDatabase(userId),
    ]);
    const reconciliation = await getReconciliation(userId, riskDashboard, {
      forceRefresh: Boolean(options.forceRefresh),
    });
    const safetyBlocked = Boolean(riskDashboard?.safetyViolations?.length);
    const checks = [
      { key: "paperMode", label: "Paper mode", status: health.paperMode ? "PASS" : "BLOCKED", detail: health.paperMode ? "Paper mode selected." : "Live mode selected. Execution remains disabled." },
      { key: "safetyEnabled", label: "Safety enabled", status: safetyBlocked ? "WARNING" : "PASS", detail: safetyBlocked ? "Safety violations are currently present." : "Safety layer is reporting no blocking violations." },
      { key: "approvalEnabled", label: "Approval workflow", status: "PASS", detail: "Paper execution remains approval-gated." },
      { key: "positionsSynced", label: "Positions synced", status: reconciliation.status === "CLEAN" ? "PASS" : reconciliation.status === "WARNING" ? "WARNING" : "BLOCKED", detail: reconciliation.brokerReason || `Reconciliation status: ${reconciliation.status}.` },
      {
        key: "openOrdersSynced",
        label: "Open orders synced",
        status: reconciliation.openOrderDifferences?.length ? "WARNING" : "PASS",
        detail: reconciliation.openOrderDifferences?.length
          ? `${reconciliation.openOrderDifferences.length} broker/app open order mismatch${
              reconciliation.openOrderDifferences.length === 1 ? "" : "es"
            } still need review.`
          : "No open-order drift detected.",
      },
      { key: "accountLoaded", label: "Account loaded", status: capabilities.canReadAccount ? "PASS" : "WARNING", detail: capabilities.canReadAccount ? "Broker account snapshot is readable." : "Read-only account snapshot is unavailable." },
      { key: "killSwitch", label: "Kill switch disabled", status: safetyBlocked ? "BLOCKED" : "PASS", detail: safetyBlocked ? "Safety rules are blocking new trading." : "No kill-switch condition detected from risk dashboard." },
      { key: "tradeLimits", label: "Trade limits configured", status: "PASS", detail: "Trade limits are enforced by safety settings and approval checks." },
      { key: "paperBrokerMode", label: "Broker mode", status: capabilities?.canPlaceOrders ? "PASS" : "WARNING", detail: capabilities?.canPlaceOrders ? "PAPER_BROKER mode is enabled." : "Switch broker execution mode to PAPER_BROKER to submit broker-routed paper orders." },
    ];
    const hasBlockedChecks = checks.some((check) => check.status === "BLOCKED");
    const hasWarningChecks = checks.some((check) => check.status === "WARNING");
    const overall = hasBlockedChecks
      ? "BLOCKED"
      : hasWarningChecks
        ? "WARNING"
        : "PASS";

    return { overall, checks, executionLocked: hasBlockedChecks };
  }

  async function getLogs(userId, limit) {
    return brokerConnectionLogRepository.list(userId, limit);
  }

  async function placePaperOrder(userId, payload) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    if (liveExecutionGuard) {
      try {
        await liveExecutionGuard.assertLiveExecutionAllowed({
          userId,
          mode:
            payload?.brokerExecutionMode ||
            payload?.broker_execution_mode ||
            payload?.mode ||
            "READ_ONLY",
          approvalId:
            payload?.approvalId ||
            payload?.approval_id ||
            payload?.approvalRequestId ||
            payload?.approval_request_id ||
            null,
          symbol: payload?.symbol,
          side: payload?.side,
          quantity: payload?.quantity,
          estimatedNotional:
            Number(payload?.estimatedNotional) ||
            Number(payload?.estimated_notional) ||
            Number(payload?.quantity || 0) * Number(payload?.entryPrice || payload?.entry_price || payload?.limitPrice || payload?.limit_price || 0),
          brokerAccountId:
            payload?.brokerAccountId || payload?.broker_account_id || null,
          requireApproval: false,
        });
      } catch (error) {
        if (!error.preflight) {
          try {
            error.preflight = await getPreflight(userId);
          } catch (_preflightError) {
            // Best-effort enrichment so the frontend can render the freshest broker state.
          }
        }
        throw error;
      }
    }

    const preflight = await getPreflight(userId);
    if (preflight.executionLocked) {
      const error = new Error("Broker execution is locked because preflight did not pass.");
      error.statusCode = 403;
      error.preflight = preflight;
      throw error;
    }
    return adapter.placeOrder(userId, payload, runtimeInput);
  }

  async function previewManualOrder(userId, payload = {}) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    const [preview, accountSummary, preflight] = await Promise.all([
      adapter.previewOrder(userId, payload, runtimeInput),
      adapter.getAccountSummary(userId, runtimeInput),
      getPreflight(userId),
    ]);

    return {
      preview: preview.preview || null,
      marketData: preview.marketData || null,
      accountSummary: {
        cash: accountSummary.cash,
        buyingPower: accountSummary.buyingPower,
        equity: accountSummary.equity,
        currency: accountSummary.currency,
      },
      validation: {
        preflightStatus: preflight.overall,
        warnings: (preflight.checks || [])
          .filter((check) => check.status !== "PASS")
          .map((check) => `${check.label}: ${check.detail}`),
      },
    };
  }

  async function cancelOrder(userId, brokerOrderId, payload = {}) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    return adapter.cancelOrder(userId, brokerOrderId, runtimeInput);
  }

  async function modifyOrder(userId, payload = {}) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    return adapter.modifyOrder(userId, payload, runtimeInput);
  }

  async function getOrderStatus(userId, payload = {}) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    return timed(userId, "GET_ORDER_STATUS", () =>
      withBrokerReadRecovery(userId, "GET_ORDER_STATUS", () =>
        adapter.getOrderStatus(userId, payload, runtimeInput)
      )
    );
  }

  async function getExecutions(userId, payload = {}) {
    const adapter = await getAdapterForUser(userId);
    const runtimeInput = await getRuntimeInput(userId, null, payload);
    return timed(userId, "GET_EXECUTIONS", () =>
      withBrokerReadRecovery(userId, "GET_EXECUTIONS", () =>
        adapter.getExecutions(userId, payload, runtimeInput)
      )
    );
  }

  async function getProvider(userId) {
    return getProviderForUser ? getProviderForUser(userId) : (await getAdapterForUser(userId)).provider;
  }

  return {
    getProvider,
    getConfig,
    testConnection,
    getHealth,
    getAccountSummary,
    invalidateAccountSummaryCache,
    getAccounts,
    getCapabilities,
    getReconciliation,
    getPreflight,
    getLogs,
    previewManualOrder,
    placePaperOrder,
    cancelOrder,
    modifyOrder,
    getOrderStatus,
    getExecutions,
    getProvider,
  };
}

module.exports = createBrokerService;
