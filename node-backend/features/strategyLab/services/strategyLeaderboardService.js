const {
  getDefaultStrategyStorageService,
} = require("./strategyStorage.service");

function createStrategyLeaderboardService({
  prisma,
  strategyStorage = getDefaultStrategyStorageService(),
}) {
  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function categorize(score) {
    if (score >= 80) return "Deploy Candidate";
    if (score >= 65) return "Paper Ready";
    if (score >= 45) return "Research";
    return "Experimental";
  }

  function scoreExperiment(experiment) {
    const latestRun = experiment.runs?.[0] || {};
    const robustness = experiment.settingsJson?.robustness || {};
    const latestWalkForward = experiment.walkForwardRuns?.[0] || {};
    const stress = experiment.stressResults?.[0] || {};
    const performance = toNumber(latestRun.sharpe) * 16 + toNumber(latestRun.returnPct) * 0.25;
    const risk = Math.max(0, 25 - Math.abs(toNumber(latestRun.maxDrawdown)));
    const tradeCount = Math.min(15, toNumber(latestRun.tradeCount) / 2);
    const stability = toNumber(robustness.score) * 0.18 + toNumber(latestWalkForward.stabilityScore) * 0.22;
    const stressPenalty = Math.max(0, toNumber(stress.probability20Drawdown) * 0.15);
    const score = Math.max(0, Math.min(100, performance + risk + tradeCount + stability - stressPenalty));

    return {
      experimentId: experiment.id,
      name: experiment.name,
      status: experiment.status,
      score: Number(score.toFixed(2)),
      category: categorize(score),
      latestRun,
      robustness,
      walkForward: latestWalkForward,
      stress,
      reasons: [
        latestRun.id ? `Sharpe ${toNumber(latestRun.sharpe).toFixed(2)}` : "No backtest run yet",
        robustness.score ? `Robustness ${robustness.score}` : "Robustness not measured",
        latestWalkForward.stabilityScore
          ? `OOS stability ${Number(latestWalkForward.stabilityScore).toFixed(1)}`
          : "Walk-forward not measured",
      ],
    };
  }

  async function getStrategyLeaderboard(userId) {
    const experimentRecords = await prisma.run((db) =>
      db.strategyExperiment.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          runs: { orderBy: { createdAt: "desc" }, take: 1 },
          walkForwardRuns: { orderBy: { createdAt: "desc" }, take: 1 },
          stressResults: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    );
    const experiments = experimentRecords.map((experiment) =>
      strategyStorage.hydrateStrategyExperimentRecord(experiment)
    );
    const ranked = experiments.map(scoreExperiment).sort((a, b) => b.score - a.score);

    return {
      generatedAt: new Date().toISOString(),
      topStrategies: ranked.slice(0, 10),
      mostStable: [...ranked].sort(
        (a, b) => toNumber(b.walkForward?.stabilityScore) - toNumber(a.walkForward?.stabilityScore)
      ).slice(0, 5),
      bestRiskAdjusted: [...ranked].sort(
        (a, b) => toNumber(b.latestRun?.sharpe) - toNumber(a.latestRun?.sharpe)
      ).slice(0, 5),
      fastestImproving: ranked.slice(0, 5),
    };
  }

  return { getStrategyLeaderboard, scoreExperiment };
}

module.exports = {
  createStrategyLeaderboardService,
};
