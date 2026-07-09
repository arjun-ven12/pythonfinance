const { computeDeploymentReadiness } = require("./deploymentReadiness");

function perturb(value, ratio) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Math.max(1, Math.round(parsed * ratio));
}

function shiftDate(value, dayOffset) {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

async function runStrategyRobustness({ experiment, runBacktest, baseConfig }) {
  const settings = experiment.settingsJson || {};
  const variants = [
    { name: "base", settings },
    { name: "ema_minus_20", settings: { ...settings, emaFast: perturb(settings.emaFast || 20, 0.8), emaSlow: perturb(settings.emaSlow || 50, 0.8) } },
    { name: "ema_plus_20", settings: { ...settings, emaFast: perturb(settings.emaFast || 20, 1.2), emaSlow: perturb(settings.emaSlow || 50, 1.2) } },
    { name: "rsi_minus_20", settings: { ...settings, rsiThreshold: perturb(settings.rsiThreshold || 55, 0.8) } },
    { name: "rsi_plus_20", settings: { ...settings, rsiThreshold: perturb(settings.rsiThreshold || 55, 1.2) } },
    {
      name: "cost_stress",
      settings,
      executionAssumptions: {
        commissionPerTrade: 2,
        regulatoryFeeBps: 1,
        slippageBps: 8,
        spreadBps: 4,
        maxParticipationRate: 0.1,
      },
    },
    {
      name: "window_shift_forward",
      settings,
      startDate: shiftDate(baseConfig.startDate, 30),
      endDate: shiftDate(baseConfig.endDate, -30),
    },
  ];
  const results = [];

  for (const variant of variants) {
    const output = await runBacktest({
      ...baseConfig,
      startDate: variant.startDate || baseConfig.startDate,
      endDate: variant.endDate || baseConfig.endDate,
      strategyConfig: {
        ...variant.settings,
        executionAssumptions: variant.executionAssumptions || baseConfig.strategyConfig?.executionAssumptions,
      },
      horizonProfile: {
        ...(baseConfig.horizonProfile || {}),
        indicator_configuration: {
          ...(baseConfig.horizonProfile?.indicator_configuration || {}),
          ema_fast: Number(variant.settings.emaFast || 20),
          ema_slow: Number(variant.settings.emaSlow || 50),
        },
        signal_threshold: Number(variant.settings.signalThreshold || 60),
      },
    });
    results.push({
      variant: variant.name,
      returnPct: output.result?.total_return_pct ?? null,
      sharpe: output.result?.sharpe_ratio ?? null,
      drawdown: output.result?.max_drawdown_pct ?? null,
      tradeCount: output.result?.completed_trades ?? null,
      profitFactor: output.result?.profit_factor ?? null,
      sortino: output.result?.sortino_ratio ?? null,
    });
  }

  const sharpeValues = results.map((item) => Number(item.sharpe)).filter(Number.isFinite);
  const returnValues = results.map((item) => Number(item.returnPct)).filter(Number.isFinite);
  const averageSharpe = sharpeValues.reduce((sum, value) => sum + value, 0) / Math.max(1, sharpeValues.length);
  const returnSpread = returnValues.length
    ? Math.max(...returnValues) - Math.min(...returnValues)
    : 100;
  const parameterSensitivity = Math.min(100, Math.max(0, returnSpread));
  const score = Math.round(Math.max(0, Math.min(100, 70 + averageSharpe * 8 - parameterSensitivity)));
  const rating = score >= 75 ? "Stable" : score >= 55 ? "Moderate" : "Fragile";

  return {
    score,
    rating,
    parameterSensitivity,
    confidenceInterval: {
      returnMin: returnValues.length ? Math.min(...returnValues) : null,
      returnMax: returnValues.length ? Math.max(...returnValues) : null,
    },
    variants: results,
    deploymentReadiness: computeDeploymentReadiness({ robustness: { score } }),
  };
}

module.exports = {
  runStrategyRobustness,
};
