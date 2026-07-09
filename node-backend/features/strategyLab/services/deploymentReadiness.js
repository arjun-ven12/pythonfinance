function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeDeploymentReadiness({
  latestRun,
  robustness,
  walkForward,
  validation,
  validationWarnings = [],
  activationRules = {},
} = {}) {
  const minimumTrades = numeric(activationRules.minimumTrades, 30);
  const minimumRobustness = numeric(activationRules.minimumRobustness, 60);
  const minimumWalkForwardStability = numeric(
    activationRules.minimumWalkForwardStability,
    55
  );
  const validationConfidenceThreshold = numeric(
    activationRules.validationConfidenceThreshold,
    55
  );
  const tradeCount = numeric(latestRun?.tradeCount);
  const sharpe = numeric(latestRun?.sharpe);
  const drawdown = Math.abs(numeric(latestRun?.maxDrawdown));
  const expectancy = numeric(latestRun?.expectancy);
  const robustnessScore = numeric(robustness?.score, 50);
  const walkForwardStability = numeric(walkForward?.stabilityScore);
  const validationConfidence = numeric(
    validation?.hitRate ?? validation?.averageConfidence
  );

  let score = 0;
  score += Math.min(25, tradeCount / 2);
  score += Math.max(0, Math.min(20, sharpe * 10));
  score += Math.max(0, 20 - drawdown);
  score += expectancy > 0 ? 15 : 0;
  score += Math.min(20, robustnessScore * 0.2);
  score += Math.min(10, walkForwardStability * 0.1);
  score += Math.min(10, validationConfidence * 0.1);
  score -= validationWarnings.length * 8;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const label = score >= 82
    ? "Deploy Candidate"
    : score >= 70
      ? "Paper Ready"
      : score >= 50
        ? "Research"
        : "Experimental";

  return {
    score,
    label,
    canActivate:
      score >= 70 &&
      validationWarnings.length === 0 &&
      tradeCount >= minimumTrades &&
      robustnessScore >= minimumRobustness &&
      walkForwardStability >= minimumWalkForwardStability &&
      validationConfidence >= validationConfidenceThreshold,
    reasons: [
      tradeCount < minimumTrades
        ? `Trade count below ${minimumTrades}.`
        : null,
      sharpe < 1 ? "Sharpe below 1.0." : null,
      drawdown > 20 ? "Drawdown exceeds 20%." : null,
      expectancy <= 0 ? "Expectancy is not positive." : null,
      robustnessScore < minimumRobustness ? "Robustness score is weak." : null,
      walkForwardStability < minimumWalkForwardStability
        ? "Walk-forward stability is weak."
        : null,
      validationConfidence < validationConfidenceThreshold
        ? "Validation confidence is below threshold."
        : null,
      ...validationWarnings,
    ].filter(Boolean),
  };
}

module.exports = {
  computeDeploymentReadiness,
};
