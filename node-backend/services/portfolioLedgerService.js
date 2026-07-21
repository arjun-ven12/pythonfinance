const prisma = require("./prisma");
const ledgerRepository = require("../repositories/transactionLedgerRepository");
const { requireUserId } = require("../repositories/ownership");

const DEFAULT_STARTING_CASH = 100000;
const EPSILON = 0.000001;
let memoryIngestionService = null;

function setMemoryIngestionService(service) {
  memoryIngestionService = service || null;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function positionArray(rawPositions) {
  if (Array.isArray(rawPositions)) return rawPositions;
  if (rawPositions && typeof rawPositions === "object") {
    return Object.entries(rawPositions).map(([symbol, position]) => ({
      symbol,
      ...(position || {}),
    }));
  }
  return [];
}

function buildBrokerMirrorEvents(ledgerState, brokerAccount = {}) {
  const currentPositions = positionArray(ledgerState?.positions);
  const brokerPositions = positionArray(brokerAccount?.positions);
  const currentMap = new Map(
    currentPositions
      .map((position) => {
        const symbol = normalizeSymbol(position.symbol);
        return [
          symbol,
          {
            symbol,
            quantity: toNumber(position.quantity),
            averageCost: toNumber(
              position.avg_price ??
                position.averageCost ??
                position.average_cost ??
                position.avgCost
            ),
            lastPrice: toNumber(position.last_price ?? position.lastPrice),
          },
        ];
      })
      .filter(([symbol]) => symbol)
  );
  const brokerMap = new Map(
    brokerPositions
      .map((position) => {
        const symbol = normalizeSymbol(position.symbol);
        const quantity = toNumber(position.quantity ?? position.shares);
        const averageCost = toNumber(
          position.averageCost ??
            position.average_cost ??
            position.avgCost ??
            position.avg_price,
          0
        );
        const lastPrice = toNumber(
          position.lastPrice ??
            position.last_price ??
            (quantity !== 0
              ? toNumber(position.marketValue ?? position.market_value, 0) /
                quantity
              : 0),
          averageCost
        );

        return [
          symbol,
          {
            symbol,
            quantity,
            averageCost,
            lastPrice,
          },
        ];
      })
      .filter(([symbol]) => symbol)
  );
  const symbols = [...new Set([...currentMap.keys(), ...brokerMap.keys()])].sort();
  const events = [];
  const summary = {
    symbolsTouched: [],
    positionsClosed: 0,
    positionsOpened: 0,
    cashAdjustment: 0,
    brokerCash: brokerAccount?.cash == null ? null : roundMoney(brokerAccount.cash),
    brokerEquity: brokerAccount?.equity == null ? null : roundMoney(brokerAccount.equity),
  };
  let projectedCash = roundMoney(ledgerState?.cash);

  const pushPositionEvent = ({
    symbol,
    quantity,
    price,
    positionDelta,
    side,
    reason,
    lastPrice,
  }) => {
    const absoluteQuantity = Math.abs(toNumber(quantity));
    if (absoluteQuantity <= EPSILON) return;
    const signedDelta = toNumber(positionDelta);
    const normalizedPrice = toNumber(price);
    const cashDelta =
      signedDelta > 0
        ? -(absoluteQuantity * normalizedPrice)
        : absoluteQuantity * normalizedPrice;
    projectedCash = roundMoney(projectedCash + cashDelta);
    events.push({
      eventType: signedDelta > 0 ? "BUY_FILL" : "SELL_FILL",
      symbol,
      quantity: absoluteQuantity,
      price: normalizedPrice,
      cashDelta,
      positionDelta: signedDelta,
      metadata: {
        side,
        reason,
        syncSource: "BROKER_ACCOUNT_MIRROR",
        lastPrice: toNumber(lastPrice, normalizedPrice),
      },
    });
  };

  for (const symbol of symbols) {
    const current = currentMap.get(symbol) || {
      symbol,
      quantity: 0,
      averageCost: 0,
      lastPrice: 0,
    };
    const target = brokerMap.get(symbol) || {
      symbol,
      quantity: 0,
      averageCost: 0,
      lastPrice: 0,
    };
    const quantityChanged =
      Math.abs(toNumber(current.quantity) - toNumber(target.quantity)) > EPSILON;
    const costChanged =
      Math.abs(toNumber(current.averageCost) - toNumber(target.averageCost)) > 0.01;

    if (!quantityChanged && !costChanged) {
      continue;
    }

    summary.symbolsTouched.push(symbol);

    if (Math.abs(toNumber(current.quantity)) > EPSILON) {
      pushPositionEvent({
        symbol,
        quantity: current.quantity,
        price:
          toNumber(current.averageCost, 0) ||
          toNumber(current.lastPrice, 0) ||
          toNumber(target.averageCost, 0) ||
          toNumber(target.lastPrice, 0),
        positionDelta: -toNumber(current.quantity),
        side: toNumber(current.quantity) > 0 ? "SELL" : "BUY",
        reason: "BROKER_LEDGER_SYNC_CLOSE_EXISTING",
        lastPrice: toNumber(current.lastPrice, current.averageCost),
      });
      summary.positionsClosed += 1;
    }

    if (Math.abs(toNumber(target.quantity)) > EPSILON) {
      pushPositionEvent({
        symbol,
        quantity: target.quantity,
        price:
          toNumber(target.averageCost, 0) ||
          toNumber(target.lastPrice, 0) ||
          toNumber(current.averageCost, 0) ||
          toNumber(current.lastPrice, 0),
        positionDelta: toNumber(target.quantity),
        side: toNumber(target.quantity) > 0 ? "BUY" : "SELL",
        reason: "BROKER_LEDGER_SYNC_OPEN_TARGET",
        lastPrice: toNumber(target.lastPrice, target.averageCost),
      });
      summary.positionsOpened += 1;
    }
  }

  if (brokerAccount?.cash != null) {
    const targetCash = roundMoney(brokerAccount.cash);
    const cashAdjustment = roundMoney(targetCash - projectedCash);
    if (Math.abs(cashAdjustment) > 0.01) {
      summary.cashAdjustment = cashAdjustment;
      events.push({
        eventType: cashAdjustment >= 0 ? "CASH_DEPOSIT" : "CASH_WITHDRAWAL",
        cashDelta: cashAdjustment,
        metadata: {
          reason: "BROKER_LEDGER_SYNC_CASH_ALIGNMENT",
          syncSource: "BROKER_ACCOUNT_MIRROR",
          targetCash,
        },
      });
      projectedCash = roundMoney(projectedCash + cashAdjustment);
    }
  }

  return {
    events,
    summary: {
      ...summary,
      positionsTouched: summary.symbolsTouched.length,
      projectedCash,
    },
  };
}

async function ensureLedgerInitialized(transaction, userId, cachedState = null) {
  await ledgerRepository.lockUserChain(transaction, userId);
  const count = await transaction.transactionLedger.count({
    where: { userId, eventType: "CASH_DEPOSIT" },
  });
  if (count > 0) return;

  const positions = positionArray(cachedState?.positions);
  const initialCash = toNumber(
    cachedState?.cash,
    cachedState ? 0 : DEFAULT_STARTING_CASH
  );
  const events = [
    {
      eventType: "CASH_DEPOSIT",
      cashDelta: initialCash,
      metadata: {
        reason: cachedState
          ? "BOOTSTRAP_FROM_LEGACY_PORTFOLIO_CACHE"
          : "INITIAL_PAPER_BALANCE",
        startingCash: toNumber(
          cachedState?.starting_cash,
          cachedState ? initialCash : DEFAULT_STARTING_CASH
        ),
        realizedPnl: toNumber(cachedState?.realized_pnl),
        feesPaid: toNumber(cachedState?.fees_paid),
      },
    },
    ...positions
      .filter((position) => toNumber(position.quantity) !== 0)
      .map((position) => ({
        eventType:
          toNumber(position.quantity) < 0 ? "SELL_FILL" : "BUY_FILL",
        symbol: position.symbol,
        quantity: Math.abs(toNumber(position.quantity)),
        price: toNumber(
          position.avg_price ??
            position.averagePrice ??
            position.entry_price ??
            position.last_price ??
            position.lastPrice
        ),
        positionDelta: toNumber(position.quantity),
        metadata: {
          reason: "BOOTSTRAP_FROM_LEGACY_PORTFOLIO_CACHE",
          lastPrice: toNumber(position.last_price ?? position.lastPrice),
        },
      })),
  ];

  await ledgerRepository.appendEvents(transaction, userId, events);
}

function reconstructPortfolio(events) {
  let cash = 0;
  let realizedPnl = 0;
  let feesPaid = 0;
  let dividends = 0;
  let startingCash = 0;
  const positions = new Map();
  const equityHistory = [];

  const getPosition = (symbol) =>
    positions.get(symbol) || {
      symbol,
      quantity: 0,
      avg_price: 0,
      last_price: 0,
      realized_pnl: 0,
    };

  for (const event of events) {
    const cashDelta = toNumber(event.cashDelta);
    cash += cashDelta;
    const symbol = event.symbol ? String(event.symbol).toUpperCase() : null;
    const positionDelta = toNumber(event.positionDelta);
    const price = toNumber(event.price);

    const eventType = event.eventType;

    if (eventType === "FEE") {
      feesPaid += Math.abs(toNumber(event.fee, cashDelta));
    }
    if (eventType === "CASH_DEPOSIT") {
      startingCash += toNumber(event.metadata?.startingCash, cashDelta);
      realizedPnl += toNumber(event.metadata?.realizedPnl);
      feesPaid += toNumber(event.metadata?.feesPaid);
    }
    if (
      eventType === "CASH_DEPOSIT" &&
      event.metadata?.reason === "DIVIDEND"
    ) {
      dividends += cashDelta;
    }

    if (
      symbol &&
      ["BUY_FILL", "SELL_FILL", "POSITION_CLOSE"].includes(eventType)
    ) {
      const position = getPosition(symbol);
      const oldQuantity = position.quantity;
      const newQuantity = oldQuantity + positionDelta;

      if (
        ["SELL_FILL", "POSITION_CLOSE"].includes(eventType) &&
        positionDelta < 0 &&
        oldQuantity > 0
      ) {
        const closedQuantity = Math.min(oldQuantity, Math.abs(positionDelta));
        const pnl = (price - position.avg_price) * closedQuantity;
        position.realized_pnl += pnl;
        realizedPnl += pnl;
      }

      if (positionDelta > 0) {
        const existingCost = Math.max(oldQuantity, 0) * position.avg_price;
        const addedCost = positionDelta * price;
        position.avg_price =
          newQuantity > 0 ? (existingCost + addedCost) / newQuantity : price;
      } else if (newQuantity < 0 && oldQuantity >= 0) {
        position.avg_price = price;
      }

      position.quantity = newQuantity;
      position.last_price =
        toNumber(event.metadata?.lastPrice, 0) || price || position.last_price;

      if (Math.abs(newQuantity) <= EPSILON) {
        positions.delete(symbol);
      } else {
        positions.set(symbol, position);
      }
    } else if (symbol && eventType === "POSITION_MARK_TO_MARKET") {
      const position = getPosition(symbol);
      if (Math.abs(position.quantity) > EPSILON) {
        position.last_price = price || toNumber(event.metadata?.lastPrice);
        positions.set(symbol, position);
      }
    }

    const marketValue = [...positions.values()].reduce(
      (total, position) =>
        total + position.quantity * (position.last_price || position.avg_price),
      0
    );
    equityHistory.push({
      timestamp: event.occurredAt,
      equity: roundMoney(cash + marketValue),
      cash: roundMoney(cash),
      event_id: event.id,
    });
  }

  const positionObject = {};
  let marketValue = 0;
  let unrealizedPnl = 0;

  for (const position of positions.values()) {
    const lastPrice = position.last_price || position.avg_price;
    const value = position.quantity * lastPrice;
    const unrealized = (lastPrice - position.avg_price) * position.quantity;
    marketValue += value;
    unrealizedPnl += unrealized;
    positionObject[position.symbol] = {
      ...position,
      market_value: roundMoney(value),
      unrealized_pnl: roundMoney(unrealized),
    };
  }

  const equity = cash + marketValue;
  return {
    generated_at: new Date().toISOString(),
    source: "TRANSACTION_LEDGER",
    cash: roundMoney(cash),
    starting_cash: roundMoney(startingCash),
    positions: positionObject,
    realized_pnl: roundMoney(realizedPnl),
    unrealized_pnl: roundMoney(unrealizedPnl),
    fees_paid: roundMoney(feesPaid),
    dividends: roundMoney(dividends),
    market_value: roundMoney(marketValue),
    equity: roundMoney(equity),
    exposure_pct:
      equity > 0
        ? roundMoney(
            ([...positions.values()].reduce(
              (total, position) =>
                total +
                Math.abs(
                  position.quantity *
                    (position.last_price || position.avg_price)
                ),
              0
            ) /
              equity) *
              100
          )
        : 0,
    equity_history: equityHistory,
    ledger_event_count: events.length,
  };
}

function comparePortfolio(ledgerState, cachedState) {
  const cachedPositions = new Map(
    positionArray(cachedState?.positions).map((position) => [
      String(position.symbol || "").toUpperCase(),
      toNumber(position.quantity),
    ])
  );
  const ledgerPositions = new Map(
    positionArray(ledgerState.positions).map((position) => [
      String(position.symbol || "").toUpperCase(),
      toNumber(position.quantity),
    ])
  );
  const symbols = new Set([...cachedPositions.keys(), ...ledgerPositions.keys()]);
  const positionDifference = {};

  for (const symbol of symbols) {
    const difference =
      (ledgerPositions.get(symbol) || 0) - (cachedPositions.get(symbol) || 0);
    if (Math.abs(difference) > EPSILON) {
      positionDifference[symbol] = difference;
    }
  }

  const cashDifference = roundMoney(
    ledgerState.cash - toNumber(cachedState?.cash)
  );
  const cachedEventCount = toNumber(cachedState?.ledger_event_count, 0);
  const missingEventCount = Math.max(
    0,
    ledgerState.ledger_event_count - cachedEventCount
  );
  const missingEvents =
    missingEventCount > 0
      ? [{ type: "CACHE_BEHIND_LEDGER", count: missingEventCount }]
      : [];
  const mismatchAmount = roundMoney(
    Math.abs(cashDifference) +
      Object.values(positionDifference).reduce(
        (total, difference) => total + Math.abs(toNumber(difference)),
        0
      )
  );
  const matched =
    Math.abs(cashDifference) <= 0.01 &&
    Object.keys(positionDifference).length === 0;
  return {
    matched,
    cashDifference,
    positionDifference,
    mismatchAmount,
    missingEvents,
    status: matched ? "VERIFIED" : "MISMATCH",
    repairAction: matched ? null : "REBUILD_PORTFOLIO_FROM_LEDGER",
    lastChecked: new Date(),
  };
}

function hasMaterialPortfolioChange(previous, next, force = false) {
  if (force || !previous) return true;
  const equityBase = Math.max(Math.abs(toNumber(previous.equity)), 1);
  const cashBase = Math.max(Math.abs(toNumber(previous.cash)), 1);
  if (Math.abs(toNumber(next.equity) - toNumber(previous.equity)) / equityBase >= 0.001) return true;
  if (Math.abs(toNumber(next.cash) - toNumber(previous.cash)) / cashBase >= 0.001) return true;
  const previousPositions = positionArray(previous.positions);
  const nextPositions = positionArray(next.positions);
  if (previousPositions.length !== nextPositions.length) return true;
  const quantities = new Map(previousPositions.map((position) => [normalizeSymbol(position.symbol), toNumber(position.quantity)]));
  return nextPositions.some((position) => Math.abs((quantities.get(normalizeSymbol(position.symbol)) || 0) - toNumber(position.quantity)) > EPSILON);
}

async function rebuildCaches(transaction, userId, cachedState = null, memoryContext = {}) {
  const events = await ledgerRepository.listEvents(transaction, userId);
  const ledgerState = reconstructPortfolio(events);
  const comparison = comparePortfolio(ledgerState, cachedState);

  await transaction.position.deleteMany({
    where: { userId, source: "paper" },
  });
  const positions = Object.values(ledgerState.positions);
  if (positions.length > 0) {
    await transaction.position.createMany({
      data: positions.map((position) => ({
        userId,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.avg_price,
        lastPrice: position.last_price,
        marketValue: position.market_value,
        unrealizedPnl: position.unrealized_pnl,
        source: "paper",
        raw: position,
      })),
    });
  }

  const snapshot = await transaction.portfolioState.create({
    data: {
      userId,
      equity: ledgerState.equity,
      cash: ledgerState.cash,
      stateJson: ledgerState,
    },
  });
  const reconciliation = await transaction.portfolioReconciliation.create({
    data: {
      userId,
      matched: comparison.matched,
      cashDifference: comparison.cashDifference,
      positionDifference: comparison.positionDifference,
      mismatchAmount: comparison.mismatchAmount,
      missingEvents: comparison.missingEvents,
      repairAction: comparison.repairAction,
      status: comparison.matched ? "VERIFIED" : "REPAIRED",
      ledgerCalculatedState: ledgerState,
      cachedPortfolioState: cachedState || null,
      lastChecked: comparison.lastChecked,
    },
  });

  if (memoryIngestionService && hasMaterialPortfolioChange(cachedState, ledgerState, memoryContext.forceMemory)) {
    const { portfolioSnapshotEvent } = require("../features/memory/services/memoryEvents");
    await memoryIngestionService.recordFromPortfolio(
      portfolioSnapshotEvent(snapshot, memoryContext),
      { transaction, critical: Boolean(memoryContext.auditCritical) }
    );
  }

  return { ledgerState, reconciliation, snapshot };
}

async function appendPaperExecution(
  transaction,
  userId,
  {
    trade,
    executionId,
    approvalId,
    orderId,
    allowNegativeCash = null,
  }
) {
  const quantity = Math.abs(toNumber(trade.quantity));
  const price = toNumber(trade.fill_price ?? trade.fillPrice);
  const fee = Math.abs(toNumber(trade.fee));
  const side = String(trade.side || "BUY").toUpperCase();
  const direction = side === "SELL" ? -1 : 1;
  const notional = quantity * price;
  const currentState = reconstructPortfolio(
    await ledgerRepository.listEvents(transaction, userId)
  );
  let negativeCashEnabled = allowNegativeCash === true;
  if (
    allowNegativeCash === null &&
    transaction.settings?.findUnique
  ) {
    const accountingSettings = await transaction.settings.findUnique({
      where: {
        userId_key: {
          userId,
          key: "paper_accounting",
        },
      },
    });
    negativeCashEnabled =
      accountingSettings?.value?.allowNegativeCash === true;
  }
  const finalCash =
    currentState.cash + (direction > 0 ? -notional : notional) - fee;

  if (!negativeCashEnabled && finalCash < -EPSILON) {
    const error = new Error(
      `Paper execution would make cash negative by ${roundMoney(
        Math.abs(finalCash)
      )}.`
    );
    error.statusCode = 409;
    throw error;
  }

  const existingOrderCreated = orderId
    ? await transaction.transactionLedger.count({
        where: { userId, orderId, eventType: "ORDER_CREATED" },
      })
    : 0;

  return ledgerRepository.appendEvents(transaction, userId, [
    ...(existingOrderCreated === 0
      ? [
          {
            eventType: "ORDER_CREATED",
            symbol: trade.symbol,
            quantity,
            price: toNumber(trade.requested_price ?? price),
            orderId,
            executionId,
            approvalId,
            metadata: {
              side,
              orderType: trade.order_type || trade.orderType || "MARKET",
              source: approvalId ? "APPROVAL_EXECUTION" : "MANUAL_TRADE",
            },
          },
        ]
      : []),
    {
      eventType: "ORDER_EXECUTED",
      symbol: trade.symbol,
      quantity,
      price: toNumber(trade.requested_price ?? price),
      orderId,
      executionId,
      approvalId,
      metadata: {
        orderType: trade.order_type || trade.orderType || "MARKET",
        status: "FILLED",
      },
    },
    {
      eventType: side === "SELL" ? "SELL_FILL" : "BUY_FILL",
      symbol: trade.symbol,
      quantity,
      price,
      cashDelta: direction > 0 ? -notional : notional,
      positionDelta: direction * quantity,
      orderId,
      executionId,
      approvalId,
      metadata: {
        side,
        orderType: trade.order_type || trade.orderType || "MARKET",
        slippageBps: toNumber(trade.slippage_bps ?? trade.slippageBps),
      },
    },
    ...(fee > 0
      ? [
          {
            eventType: "FEE",
            symbol: trade.symbol,
            fee,
            cashDelta: -fee,
            orderId,
            executionId,
            approvalId,
            metadata: { side },
          },
        ]
      : []),
  ]);
}

async function recordManualTrade(userId, input) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const cached = await transaction.portfolioState.findFirst({
        where: { userId: ownerId },
        orderBy: { updatedAt: "desc" },
      });
      await ensureLedgerInitialized(transaction, ownerId, cached?.stateJson);
      const trade = await transaction.trade.create({
        data: {
          ...input,
          userId: ownerId,
          source: "manual",
        },
      });
      await appendPaperExecution(transaction, ownerId, {
        trade: {
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          fill_price: trade.entryPrice,
          fee: trade.fees,
          order_type: trade.orderType || "MARKET",
        },
        executionId: trade.id,
        orderId: trade.id,
        approvalId: null,
      });
      const rebuilt = await rebuildCaches(
        transaction,
        ownerId,
        cached?.stateJson
      );
      return { trade, ...rebuilt };
    })
  );
}

async function reconcilePortfolio(transaction, userId, cachedState) {
  const events = await ledgerRepository.listEvents(transaction, userId);
  const ledgerState = reconstructPortfolio(events);
  const comparison = comparePortfolio(ledgerState, cachedState);
  const integrity = await ledgerRepository.verifyHashChain(transaction, userId);
  const status = integrity.valid ? comparison.status : "HASH_CORRUPTED";
  const reconciliation = await transaction.portfolioReconciliation.create({
    data: {
      userId,
      matched: integrity.valid && comparison.matched,
      cashDifference: comparison.cashDifference,
      positionDifference: comparison.positionDifference,
      mismatchAmount: comparison.mismatchAmount,
      missingEvents: comparison.missingEvents,
      repairAction: integrity.valid
        ? comparison.repairAction
        : "INVESTIGATE_LEDGER_CHAIN",
      status,
      ledgerCalculatedState: ledgerState,
      cachedPortfolioState: cachedState || null,
      lastChecked: comparison.lastChecked,
    },
  });
  return { ledgerState, reconciliation, integrity };
}

async function getPortfolioForUser(userId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const cached = await transaction.portfolioState.findFirst({
        where: { userId: ownerId },
        orderBy: { updatedAt: "desc" },
      });
      await ensureLedgerInitialized(transaction, ownerId, cached?.stateJson);
      return reconcilePortfolio(transaction, ownerId, cached?.stateJson);
    })
  );
}

async function rebuildPortfolioFromLedger(userId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const cached = await transaction.portfolioState.findFirst({
        where: { userId: ownerId },
        orderBy: { updatedAt: "desc" },
      });
      await ensureLedgerInitialized(transaction, ownerId, cached?.stateJson);
      const integrity = await ledgerRepository.verifyHashChain(
        transaction,
        ownerId
      );
      if (!integrity.valid) {
        const error = new Error(
          `Ledger hash chain is corrupted at event ${integrity.corruptedEventId}.`
        );
        error.statusCode = 409;
        throw error;
      }
      return rebuildCaches(transaction, ownerId, cached?.stateJson);
    })
  );
}

async function syncLedgerFromBrokerAccount(userId, brokerAccount = {}) {
  const ownerId = requireUserId(userId);
  if (!brokerAccount || brokerAccount.available === false) {
    const error = new Error(
      brokerAccount?.reason || "Broker account is unavailable for ledger sync."
    );
    error.statusCode = 409;
    throw error;
  }

  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const cached = await transaction.portfolioState.findFirst({
        where: { userId: ownerId },
        orderBy: { updatedAt: "desc" },
      });
      await ensureLedgerInitialized(transaction, ownerId, cached?.stateJson);
      const integrity = await ledgerRepository.verifyHashChain(
        transaction,
        ownerId
      );
      if (!integrity.valid) {
        const error = new Error(
          `Ledger hash chain is corrupted at event ${integrity.corruptedEventId}.`
        );
        error.statusCode = 409;
        throw error;
      }

      const currentState = reconstructPortfolio(
        await ledgerRepository.listEvents(transaction, ownerId)
      );
      const plan = buildBrokerMirrorEvents(currentState, brokerAccount);
      if (plan.events.length === 0) {
        const rebuilt = await rebuildCaches(transaction, ownerId, cached?.stateJson);
        return {
          ...rebuilt,
          syncSummary: {
            ...plan.summary,
            changed: false,
          },
        };
      }

      await ledgerRepository.appendEvents(transaction, ownerId, plan.events);
      const rebuilt = await rebuildCaches(transaction, ownerId, cached?.stateJson);
      return {
        ...rebuilt,
        syncSummary: {
          ...plan.summary,
          changed: true,
        },
      };
    })
  );
}

function estimateLedgerImpact(order, currentCash = 0, fee = 0) {
  const quantity = Math.abs(toNumber(order.quantity));
  const price = toNumber(order.entryPrice ?? order.entry_price);
  const side = String(order.side || "BUY").toUpperCase();
  const notional = quantity * price;
  const cashDelta = side === "SELL" ? notional - fee : -notional - fee;
  const positionDelta = side === "SELL" ? -quantity : quantity;

  return {
    eventTypes: [
      "ORDER_EXECUTED",
      side === "SELL" ? "SELL_FILL" : "BUY_FILL",
      ...(fee > 0 ? ["FEE"] : []),
    ],
    estimatedNotional: roundMoney(notional),
    estimatedFee: roundMoney(fee),
    cashDelta: roundMoney(cashDelta),
    positionDelta,
    cashAfter: roundMoney(toNumber(currentCash) + cashDelta),
    wouldMakeCashNegative: toNumber(currentCash) + cashDelta < 0,
  };
}

async function verifyUserLedger(userId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    ledgerRepository.verifyHashChain(db, ownerId)
  );
}

module.exports = {
  appendPaperExecution,
  buildBrokerMirrorEvents,
  comparePortfolio,
  estimateLedgerImpact,
  ensureLedgerInitialized,
  getPortfolioForUser,
  hasMaterialPortfolioChange,
  recordManualTrade,
  rebuildCaches,
  rebuildPortfolioFromLedger,
  reconstructPortfolio,
  setMemoryIngestionService,
  syncLedgerFromBrokerAccount,
  verifyUserLedger,
};
