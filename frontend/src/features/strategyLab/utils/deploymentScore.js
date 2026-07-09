export function getDeploymentScore(metrics) {
  let score = 100;
  const reasons = [];

  if (metrics.alphaBuyHold !== null && metrics.alphaBuyHold < 0) {
    score -= 25;
    reasons.push("underperformed buy-and-hold");
  }
  if ((metrics.sharpe ?? 0) < 1) {
    score -= 20;
    reasons.push("low Sharpe");
  }
  if (Math.abs(metrics.maxDrawdown ?? 0) > 20) {
    score -= 20;
    reasons.push("high drawdown");
  }
  if ((metrics.tradeCount ?? 0) < 10) {
    score -= 15;
    reasons.push("low trade count");
  }
  if ((metrics.expectancy ?? 0) <= 0) {
    score -= 20;
    reasons.push("poor expectancy");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  const verdict =
    normalizedScore >= 75
      ? "Deployable"
      : normalizedScore >= 50
        ? "Needs Improvement"
        : "Do Not Deploy";

  return {
    score: normalizedScore,
    verdict,
    reasons: reasons.length ? reasons : ["meets baseline research checks"],
  };
}

