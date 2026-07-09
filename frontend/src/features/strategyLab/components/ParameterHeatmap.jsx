import { Fragment } from "react";

function getMetric(result, metric) {
  if (metric === "returnPct") return Number(result.returnPct || 0);
  if (metric === "maxDrawdown") return Number(result.maxDrawdown || 0);
  if (metric === "winRate") return Number(result.winRate || 0);
  if (metric === "expectancy") return Number(result.expectancy || 0);
  if (metric === "cagr") return Number(result.cagr || result.returnPct || 0);
  if (metric === "profitFactor") return Number(result.profitFactor || 0);
  return Number(result.sharpe || 0);
}

function getCellStyle(value, min, max, metric) {
  const lowerIsBetter = metric === "maxDrawdown";
  const range = max - min || 1;
  const normalized = lowerIsBetter ? (max - value) / range : (value - min) / range;
  const intensity = Math.max(0.12, Math.min(0.88, normalized));
  const hue = normalized >= 0.5 ? "76, 195, 138" : "255, 107, 107";
  return {
    background: `rgba(${hue}, ${0.12 + intensity * 0.34})`,
    borderColor: `rgba(${hue}, ${0.3 + intensity * 0.35})`,
  };
}

export default function ParameterHeatmap({
  metric = "sharpe",
  results = [],
}) {
  if (!results.length) {
    return null;
  }

  const xValues = [...new Set(results.map((result) => result.emaFast))].sort((a, b) => a - b);
  const yValues = [...new Set(results.map((result) => result.emaSlow))].sort((a, b) => a - b);
  const values = results.map((result) => getMetric(result, metric));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lookup = new Map(results.map((result) => [`${result.emaFast}-${result.emaSlow}`, result]));

  return (
    <div className="strategy-parameter-heatmap">
      <div className="strategy-heatmap-header">
        <span>Parameter stability map</span>
        <strong>{metric}</strong>
      </div>
      <div
        className="strategy-heatmap-grid"
        style={{ gridTemplateColumns: `90px repeat(${xValues.length}, minmax(56px, 1fr))` }}
      >
        <span />
        {xValues.map((xValue) => <span key={`x-${xValue}`}>Fast {xValue}</span>)}
        {yValues.map((yValue) => (
          <Fragment key={`row-${yValue}`}>
            <strong key={`label-${yValue}`}>Slow {yValue}</strong>
            {xValues.map((xValue) => {
              const result = lookup.get(`${xValue}-${yValue}`);
              const value = result ? getMetric(result, metric) : null;
              return (
                <button
                  aria-label={`EMA ${xValue}/${yValue}`}
                  disabled={!result}
                  key={`${xValue}-${yValue}`}
                  style={value === null ? undefined : getCellStyle(value, min, max, metric)}
                  title={result ? `RSI ${result.rsiThreshold}` : "Not tested"}
                  type="button"
                >
                  {value === null ? "-" : value.toFixed(2)}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
