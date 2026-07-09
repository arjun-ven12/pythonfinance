import { getRunResult } from "./strategyMetrics";

export function normalizeEquityPoint(point, index) {
  return {
    label: point.date || point.timestamp || point.label || String(index + 1),
    strategy: Number(point.equity ?? point.strategy ?? point.value ?? 0),
    buyHold: Number(point.buy_and_hold ?? point.buyHold ?? point.buy_hold ?? 0),
    benchmark: Number(point.benchmark ?? point.benchmark_equity ?? 0),
  };
}

export function getRunEquityData(run) {
  const result = getRunResult(run);
  const equityCurve = result.equity_curve || run?.settingsJson?.equity_curve || [];
  const benchmarkCurve = result.benchmark_curve || run?.settingsJson?.benchmark_curve || [];

  return equityCurve.map((point, index) => {
    const normalized = normalizeEquityPoint(point, index);
    const benchmarkPoint = benchmarkCurve[index] || {};
    const benchmarkValue = Number(benchmarkPoint.benchmark ?? benchmarkPoint.buyHold ?? 0);

    return {
      ...normalized,
      buyHold: normalized.buyHold || benchmarkValue,
      benchmark: normalized.benchmark || benchmarkValue,
    };
  });
}

export function getRunDrawdownData(run) {
  const result = getRunResult(run);
  return (result.drawdown_curve || run?.settingsJson?.drawdown_curve || []).map((point, index) => ({
    label: point.date || point.timestamp || point.label || String(index + 1),
    strategy: Number(point.drawdown ?? point.strategy ?? point.value ?? 0),
    buyHold: Number(point.buy_and_hold_drawdown ?? point.buyHold ?? point.buy_hold ?? 0),
    benchmark: Number(point.benchmark_drawdown ?? point.benchmark ?? 0),
  }));
}

export function getRollingReturnData(equityData) {
  return equityData.map((point, index) => {
    if (index === 0) {
      return { label: point.label, strategy: 0, buyHold: 0, benchmark: 0 };
    }

    const previous = equityData[index - 1];
    const pct = (current, prior) => prior ? ((current - prior) / prior) * 100 : 0;

    return {
      label: point.label,
      strategy: pct(point.strategy, previous.strategy),
      buyHold: pct(point.buyHold, previous.buyHold),
      benchmark: pct(point.benchmark, previous.benchmark),
    };
  });
}



