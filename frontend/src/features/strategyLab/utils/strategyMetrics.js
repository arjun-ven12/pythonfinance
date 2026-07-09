export function getNumericValue(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function normalizeRegimeBreakdown(result = {}) {
  const rows = Array.isArray(result.regime_breakdown) ? result.regime_breakdown : [];
  const completedTrades = Array.isArray(result.completed_trade_log)
    ? result.completed_trade_log
    : Array.isArray(result.trades)
      ? result.trades.filter((trade) => String(trade.type || "").toUpperCase() === "SELL")
      : [];

  if (!rows.length || !completedTrades.length) {
    return rows;
  }

  const shouldBackfillPct = rows.some(
    (row) =>
      getNumericValue(row.return_pct, row.returnPct, row.averageReturnPct, row.averageReturn) === null ||
      getNumericValue(row.drawdown_pct, row.drawdownPct, row.maxDrawdownPct, row.averageDrawdownPct) === null
  );
  if (!shouldBackfillPct) {
    return rows;
  }

  const grouped = completedTrades.reduce((acc, trade) => {
    const regime = trade.market_regime || trade.marketRegime || trade.regime || "UNKNOWN";
    const bucket = acc.get(regime) || { returns: [] };
    const returnPct = getNumericValue(trade.return_pct, trade.returnPct);
    if (returnPct !== null) {
      bucket.returns.push(returnPct);
    }
    acc.set(regime, bucket);
    return acc;
  }, new Map());

  return rows.map((row) => {
    const regime = row.regime || row.group || "UNKNOWN";
    const returns = grouped.get(regime)?.returns || [];
    if (!returns.length) {
      return row;
    }
    const averageReturnPct =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const drawdownPct = Math.abs(Math.min(...returns));
    return {
      ...row,
      averageReturnPct: round(averageReturnPct),
      returnPct: round(averageReturnPct),
      drawdownPct: round(drawdownPct),
      maxDrawdownPct: round(drawdownPct),
    };
  });
}

export function formatLabMetric(value, suffix = "", decimals = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(decimals)}${suffix}` : "Not Available";
}

export function getRunResult(run) {
  const settings = run?.settingsJson || {};
  const result = {
    ...(settings.result_summary || {}),
    ...(settings.result || {}),
    ...settings,
  };
  result.regime_breakdown = normalizeRegimeBreakdown(result);
  return result;
}

export function getPersistedBacktestTrades(run) {
  if (run?.trades?.length > 0) {
    return run.trades.map((trade) => ({
      symbol: trade.symbol,
      side: trade.side,
      entry_date: trade.entryDate,
      exit_date: trade.exitDate,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      shares: trade.shares,
      pnl: trade.pnl,
      return_pct: trade.returnPct,
      holding_period_days: trade.holdingPeriodDays,
      exit_reason: trade.exitReason,
      confidence: trade.confidence,
      stop_loss: trade.stopLoss,
      trailing_stop: trade.trailingStop,
      take_profit: trade.takeProfit,
    }));
  }

  const result = getRunResult(run);
  const completedTrades = result.completed_trade_log || [];
  const savedTrades = result.trades || run?.settingsJson?.trades || [];
  const rawEvents = result.raw_trade_events || run?.settingsJson?.raw_trade_events || [];

  if (completedTrades.length > 0) {
    return completedTrades;
  }

  if (savedTrades.length > 0) {
    return savedTrades;
  }

  return rawEvents.filter((trade) => String(trade.type || "").toUpperCase() === "SELL");
}

export function getStrategyRunMetrics(run) {
  const result = getRunResult(run);
  const strategyReturn = getNumericValue(run?.returnPct, result.total_return_pct, result.returnPct);
  const buyHoldReturn = getNumericValue(result.buy_and_hold_return_pct, result.buyAndHoldReturnPct);
  const benchmarkReturn = getNumericValue(result.benchmark_return_pct, result.benchmarkReturnPct);
  const maxDrawdown = getNumericValue(run?.maxDrawdown, result.max_drawdown_pct, result.maxDrawdown);
  const sharpe = getNumericValue(run?.sharpe, result.sharpe_ratio, result.sharpe);
  const expectancy = getNumericValue(run?.expectancy, result.expectancy_per_trade, result.expectancy);
  const tradeCount = getNumericValue(run?.tradeCount, result.completed_trades, result.trade_count);

  return {
    strategyReturn,
    buyHoldReturn,
    benchmarkReturn,
    benchmarkUnavailable: Boolean(
      result.benchmarkUnavailable || result.benchmark_unavailable
    ),
    alphaBuyHold:
      strategyReturn !== null && buyHoldReturn !== null ? strategyReturn - buyHoldReturn : null,
    alphaBenchmark:
      strategyReturn !== null && benchmarkReturn !== null ? strategyReturn - benchmarkReturn : null,
    cagr: getNumericValue(run?.cagr, result.annualized_return_pct, result.cagr),
    sharpe,
    sortino: getNumericValue(result.sortino_ratio, result.sortino, run?.settingsJson?.sortino),
    maxDrawdown,
    winRate: getNumericValue(run?.winRate, result.win_rate_pct, result.winRate),
    expectancy,
    tradeCount,
    profitFactor: getNumericValue(result.profit_factor, result.profitFactor),
    averageHoldDuration:
      result.average_hold_duration ||
      result.average_holding_period ||
      result.average_holding_period_days ||
      run?.settingsJson?.average_hold_duration ||
      "Not Available",
    buyHoldDrawdown: getNumericValue(result.buy_and_hold_drawdown_pct, result.buyHoldDrawdownPct),
    benchmarkDrawdown: getNumericValue(result.benchmark_drawdown_pct, result.benchmarkDrawdownPct),
    buyHoldSharpe: getNumericValue(result.buy_and_hold_sharpe, result.buyHoldSharpe),
    benchmarkSharpe: getNumericValue(result.benchmark_sharpe, result.benchmarkSharpe),
  };
}
