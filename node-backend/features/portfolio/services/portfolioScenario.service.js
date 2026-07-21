const { validatePortfolioProposal } = require("./portfolioScenarioContract");

const EXECUTION_COST_ASSUMPTIONS = Object.freeze({
  commissionPerTrade: 2,
  regulatoryFeeBps: 1,
  slippageBps: 8,
  spreadBps: 4,
  source: "STRATEGY_LAB_COST_STRESS",
});

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allocationConcentration(items, valueKey) {
  const values = items.map((item) => Math.max(0, Number(item[valueKey]) || 0) / 100);
  return round(values.reduce((sum, value) => sum + value ** 2, 0) * 100, 2);
}

function summarizeSnapshot(state) {
  const equity = state.equity;
  const positions = state.positions
    .map((position) => ({ ...position, weightPct: equity ? round(Math.abs(position.marketValue) / equity * 100, 2) : null }))
    .sort((left, right) => Math.abs(right.marketValue) - Math.abs(left.marketValue));
  const sectors = new Map();
  positions.forEach((position) => {
    const row = sectors.get(position.sector) || { sector: position.sector, marketValue: 0, positionCount: 0 };
    row.marketValue += Math.abs(position.marketValue);
    row.positionCount += 1;
    sectors.set(position.sector, row);
  });
  const sectorExposure = [...sectors.values()]
    .map((row) => ({ ...row, weightPct: equity ? round(row.marketValue / equity * 100, 2) : null }))
    .sort((left, right) => right.weightPct - left.weightPct);
  const hhi = positions.reduce((sum, position) => sum + ((position.weightPct || 0) / 100) ** 2, 0);
  return {
    equity: round(equity, 2),
    cash: round(state.cash, 2),
    buyingPower: state.buyingPowerModel === "CASH_ONLY" ? round(state.cash, 2) : null,
    cashPct: equity ? round(state.cash / equity * 100, 2) : null,
    grossExposurePct: equity ? round(positions.reduce((sum, item) => sum + Math.abs(item.marketValue), 0) / equity * 100, 2) : null,
    largestPositionPct: positions[0]?.weightPct ?? 0,
    largestSectorPct: sectorExposure[0]?.weightPct ?? 0,
    diversificationScore: round(Math.max(0, 1 - hhi) * 100, 2),
    positions,
    sectorExposure,
    strategyAllocations: state.strategyAllocations,
    strategyConcentration: allocationConcentration(state.strategyAllocations, "assignedCapitalPct"),
    matrixAllocations: state.matrixAllocations,
    matrixConcentration: allocationConcentration(state.matrixAllocations, "allocationPct"),
  };
}

function createPortfolioScenarioService({ simulateStrategyPortfolio, getQuote, now = () => Date.now() } = {}) {
  const cache = new Map();
  async function simulate({ userId, context, proposal }) {
    context = clone(context);
    const currentSymbols = new Set((context.positions || []).map((position) => position.symbol));
    const additions = proposal.actions.filter((action) => action.actionType === "ADD_POSITION" && !currentSymbols.has(String(action.symbol).toUpperCase()));
    for (const addition of additions) {
      if (typeof getQuote !== "function") {
        const error = new Error("ADD_POSITION requires platform market data, which is unavailable.");
        error.statusCode = 400;
        throw error;
      }
      const quote = await getQuote(userId, String(addition.symbol).toUpperCase());
      const currentPrice = Number(quote?.quote?.last ?? quote?.last ?? quote?.price);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        const error = new Error(`Current platform price is unavailable for ${addition.symbol}.`);
        error.statusCode = 400;
        throw error;
      }
      context.positions.push({
        symbol: String(addition.symbol).toUpperCase(), sector: addition.sector || "UNKNOWN", marketValue: 0,
        currentPrice, portfolioWeightPct: 0, priceTimestamp: quote?.lastUpdated || quote?.generatedAt || null,
      });
    }
    validatePortfolioProposal(proposal, context);
    const cacheKey = JSON.stringify([userId, context.provider, context.freshness?.portfolioSnapshotTimestamp, context.freshness?.marketPriceTimestamp, proposal]);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return clone(cached.value);
    const state = {
      equity: Number(context.account.equity) || 0,
      cash: Number(context.account.cash) || 0,
      buyingPowerModel: context.provider === "INTERNAL_PAPER" ? "CASH_ONLY" : "UNAVAILABLE",
      positions: clone(context.positions || []).map((position) => ({
        symbol: position.symbol,
        sector: position.sector || "UNKNOWN",
        industry: position.industry || "UNKNOWN",
        marketValue: Number(position.marketValue) || 0,
        currentPrice: Number(position.currentPrice) || 0,
      })),
      strategyAllocations: clone(context.tradingState?.strategyAllocations || []),
      matrixAllocations: clone(context.tradingState?.matrixAllocations || []),
    };
    const current = summarizeSnapshot(state);
    const initialValues = new Map(state.positions.map((position) => [position.symbol, position.marketValue]));

    const setPositionWeight = (symbol, targetPct) => {
      const position = state.positions.find((item) => item.symbol === symbol);
      const targetValue = state.equity * targetPct / 100;
      state.cash -= targetValue - position.marketValue;
      position.marketValue = targetValue;
    };

    proposal.actions.forEach((action) => {
      const value = Number(action.proposedValue);
      switch (action.actionType) {
        case "REDUCE_POSITION":
        case "INCREASE_POSITION":
        case "SET_SYMBOL_WEIGHT":
        case "ADD_POSITION":
          setPositionWeight(String(action.symbol).toUpperCase(), action.unit === "USD" ? value / state.equity * 100 : value);
          break;
        case "REMOVE_POSITION":
          setPositionWeight(String(action.symbol).toUpperCase(), 0);
          break;
        case "SET_CASH_TARGET": { const target = action.unit === "USD" ? value : state.equity * value / 100; const invested = state.positions.reduce((sum, item) => sum + Math.abs(item.marketValue), 0); const scale = invested ? Math.max(0, state.equity - target) / invested : 0; state.positions.forEach((item) => { item.marketValue *= scale; }); state.cash = target; break; }
        case "SET_SECTOR_CAP": { const sector = String(action.sector); const target = action.unit === "USD" ? value : state.equity * value / 100; const rows = state.positions.filter((item) => item.sector === sector); const existing = rows.reduce((sum, item) => sum + Math.abs(item.marketValue), 0); if (existing > target && existing > 0) { const scale = target / existing; rows.forEach((item) => { const before = item.marketValue; item.marketValue *= scale; state.cash += before - item.marketValue; }); } break; }
        case "SET_INDUSTRY_CAP": { const industry = String(action.industry); const target = action.unit === "USD" ? value : state.equity * value / 100; const rows = state.positions.filter((item) => item.industry === industry); const existing = rows.reduce((sum, item) => sum + Math.abs(item.marketValue), 0); if (existing > target && existing > 0) { const scale = target / existing; rows.forEach((item) => { const before = item.marketValue; item.marketValue *= scale; state.cash += before - item.marketValue; }); } break; }
        case "EQUAL_WEIGHT": { const active = state.positions.filter((item) => item.marketValue !== 0); const target = active.length ? (state.equity - state.cash) / active.length : 0; active.forEach((item) => { item.marketValue = target; }); break; }
        case "CUSTOM_TARGET_WEIGHTS": action.targetWeights.forEach((target) => setPositionWeight(String(target.symbol).toUpperCase(), Number(target.weightPct))); break;
        case "SET_STRATEGY_WEIGHT": { const row = state.strategyAllocations.find((item) => item.strategyId === action.strategyId); row.assignedCapitalPct = value; break; }
        case "ADD_STRATEGY_WEIGHT": { const existing = state.strategyAllocations.find((item) => item.strategyId === action.strategyId); if (existing) existing.assignedCapitalPct = value; else { const strategy = context.tradingState?.availableStrategies?.find((item) => item.id === action.strategyId); state.strategyAllocations.push({ id: `scenario:${action.strategyId}`, strategyId: action.strategyId, strategyName: strategy?.name || action.strategyId, assignedCapitalPct: value, status: "PROPOSED" }); } break; }
        case "REMOVE_STRATEGY_WEIGHT": { const row = state.strategyAllocations.find((item) => item.strategyId === action.strategyId); if (row) row.assignedCapitalPct = 0; break; }
        case "SET_MATRIX_WEIGHT": { const row = state.matrixAllocations.find((item) => item.id === action.matrixCell.id); row.allocationPct = value; break; }
        case "REMOVE_MATRIX_WEIGHT": { const row = state.matrixAllocations.find((item) => item.id === action.matrixCell.id); row.allocationPct = 0; row.status = "SIT_OUT"; break; }
        case "DISABLE_MATRIX_CELL": { const row = state.matrixAllocations.find((item) => item.id === action.matrixCell.id); row.allocationPct = 0; row.status = "SIT_OUT"; break; }
        case "ENABLE_MATRIX_CELL": { const row = state.matrixAllocations.find((item) => item.id === action.matrixCell.id); row.allocationPct = value; row.status = "ACTIVE"; break; }
        default: break;
      }
    });

    if (state.cash < -0.01) {
      const error = new Error("Proposed position targets require more capital than the current portfolio provides.");
      error.statusCode = 400;
      throw error;
    }
    const strategyTotal = state.strategyAllocations.reduce((sum, item) => sum + (Number(item.assignedCapitalPct) || 0), 0);
    if (strategyTotal > 100.0001) {
      const error = new Error("Proposed strategy allocations exceed 100%.");
      error.statusCode = 400;
      throw error;
    }
    state.cash = Math.max(0, state.cash);
    const proposed = summarizeSnapshot(state);
    const tradedNotional = state.positions.reduce((sum, item) => sum + Math.abs(item.marketValue - (initialValues.get(item.symbol) || 0)), 0);
    const affectedTrades = state.positions.filter((item) => Math.abs(item.marketValue - (initialValues.get(item.symbol) || 0)) > 0.01).length;
    const variableCostBps = EXECUTION_COST_ASSUMPTIONS.regulatoryFeeBps + EXECUTION_COST_ASSUMPTIONS.slippageBps + EXECUTION_COST_ASSUMPTIONS.spreadBps;
    const estimatedCosts = round(affectedTrades * EXECUTION_COST_ASSUMPTIONS.commissionPerTrade + tradedNotional * variableCostBps / 10000, 2);
    const allowedTurnover = Number(context.preferences?.allowedTurnoverPct);
    if (Number.isFinite(allowedTurnover) && (state.equity ? tradedNotional / state.equity * 100 : 0) > allowedTurnover + 0.0001) {
      const error = new Error(`Estimated turnover exceeds the ${allowedTurnover}% advanced-mode limit.`);
      error.statusCode = 400;
      throw error;
    }
    const maximumCost = Number(context.preferences?.maximumTransactionCost);
    if (Number.isFinite(maximumCost) && estimatedCosts > maximumCost) {
      const error = new Error(`Estimated transaction costs exceed the ${maximumCost} advanced-mode limit.`);
      error.statusCode = 400;
      throw error;
    }
    const hasStrategyChange = proposal.actions.some((action) => ["SET_STRATEGY_WEIGHT", "ADD_STRATEGY_WEIGHT", "REMOVE_STRATEGY_WEIGHT"].includes(action.actionType));
    let historicalSimulation = null;
    if (hasStrategyChange && typeof simulateStrategyPortfolio === "function" && state.strategyAllocations.length >= 2) {
      const currentWeights = Object.fromEntries((context.tradingState?.strategyAllocations || []).map((item) => [item.strategyId, Number(item.assignedCapitalPct) / 100]));
      const proposedWeights = Object.fromEntries(state.strategyAllocations.map((item) => [item.strategyId, Number(item.assignedCapitalPct) / 100]));
      try {
        const experimentIds = Object.keys(proposedWeights);
        historicalSimulation = {
          current: await simulateStrategyPortfolio({ userId, body: { experimentIds, allocationMode: "CUSTOM", weights: currentWeights } }),
          proposed: await simulateStrategyPortfolio({ userId, body: { experimentIds, allocationMode: "CUSTOM", weights: proposedWeights } }),
        };
      } catch (error) {
        historicalSimulation = { unavailable: true, reason: error.message };
      }
    }
    const hasMatrixChange = proposal.actions.some((action) => ["SET_MATRIX_WEIGHT", "REMOVE_MATRIX_WEIGHT", "ENABLE_MATRIX_CELL", "DISABLE_MATRIX_CELL"].includes(action.actionType));
    const result = {
      method: hasStrategyChange && historicalSimulation && !historicalSimulation.unavailable ? "HISTORICAL_STRATEGY_SIMULATION" : "SNAPSHOT_REALLOCATION",
      advisoryOnly: true,
      noChangesApplied: true,
      inputValidity: context.freshness?.stale ? "STALE_INPUT" : "CURRENT",
      current,
      proposed,
      changes: {
        cash: round(proposed.cash - current.cash, 2),
        cashPct: round((proposed.cashPct || 0) - (current.cashPct || 0), 2),
        largestPositionPct: round(proposed.largestPositionPct - current.largestPositionPct, 2),
        largestSectorPct: round(proposed.largestSectorPct - current.largestSectorPct, 2),
        diversificationScore: round(proposed.diversificationScore - current.diversificationScore, 2),
        strategyConcentration: round(proposed.strategyConcentration - current.strategyConcentration, 2),
        matrixConcentration: round(proposed.matrixConcentration - current.matrixConcentration, 2),
      },
      turnoverPct: state.equity ? round(tradedNotional / state.equity * 100, 2) : null,
      transactionCosts: { estimatedTotal: estimatedCosts, tradedNotional: round(tradedNotional, 2), affectedTrades, assumptions: EXECUTION_COST_ASSUMPTIONS },
      unsupportedMetrics: [
        "volatility",
        ...(!Number.isFinite(Number(historicalSimulation?.proposed?.metrics?.combinedDrawdown)) ? ["drawdown"] : []),
        ...(!Number.isFinite(Number(historicalSimulation?.proposed?.metrics?.correlation)) ? ["correlation"] : []),
      ],
      historicalSimulation,
      matrixSimulation: hasMatrixChange ? { method: "STATIC_ALLOCATION_ONLY", replayRun: false } : null,
    };
    cache.set(cacheKey, { value: clone(result), expiresAt: now() + 60_000 });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return result;
  }

  return { simulate };
}

module.exports = { EXECUTION_COST_ASSUMPTIONS, createPortfolioScenarioService, summarizeSnapshot };
