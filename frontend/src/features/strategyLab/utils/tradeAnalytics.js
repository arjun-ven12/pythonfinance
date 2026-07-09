import { getNumericValue, getPersistedBacktestTrades, getRunResult } from "./strategyMetrics";

export function getTradeAnalytics(run) {
  const result = getRunResult(run);
  const trades = getPersistedBacktestTrades(run);
  const returns = trades
    .map((trade) => getNumericValue(trade.return_pct, trade.returnPct, trade.pnl_pct))
    .filter((value) => value !== null);
  const winners = returns.filter((value) => value > 0);
  const losers = returns.filter((value) => value < 0);
  const average = (values) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  const exitCount = (name) =>
    trades.filter((trade) => String(trade.reason || trade.exit_reason || "").toUpperCase().includes(name)).length;

  return {
    winRate: getNumericValue(run?.winRate, result.win_rate_pct),
    profitFactor: getNumericValue(result.profit_factor),
    averageWinner: getNumericValue(
      average(winners),
      result.average_winner_pct,
      result.avg_win_pct,
      result.average_winner,
      result.avg_win
    ),
    averageLoser: getNumericValue(
      average(losers),
      result.average_loser_pct,
      result.avg_loss_pct,
      result.average_loser,
      result.avg_loss
    ),
    largestWinner: getNumericValue(
      winners.length ? Math.max(...winners) : null,
      result.largest_winner_pct,
      result.largest_winner
    ),
    largestLoser: getNumericValue(
      losers.length ? Math.min(...losers) : null,
      result.largest_loser_pct,
      result.largest_loser
    ),
    averageHoldDuration:
      result.average_hold_duration ||
      result.average_holding_period ||
      result.average_holding_period_days ||
      "Not Available",
    numberOfTrades: getNumericValue(run?.tradeCount, result.completed_trades, trades.length),
    stopLossExits: exitCount("STOP_LOSS"),
    trailingStopExits: exitCount("TRAILING_STOP"),
    takeProfitExits: exitCount("TAKE_PROFIT"),
  };
}

