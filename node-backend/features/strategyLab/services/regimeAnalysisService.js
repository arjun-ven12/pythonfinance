function createRegimeAnalysisService({ prisma }) {
  function summarizeTradesByRegime(trades = []) {
    const buckets = new Map();

    for (const trade of trades) {
      const raw = trade.raw || {};
      const regime =
        raw.market_regime ||
        raw.regime ||
        trade.marketRegime ||
        trade.regime ||
        "UNKNOWN";
      const bucket = buckets.get(regime) || {
        regime,
        tradeCount: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        grossProfit: 0,
        grossLoss: 0,
        maxDrawdown: 0,
      };
      const pnl = Number(trade.pnl ?? raw.pnl ?? raw.profit ?? 0);
      bucket.tradeCount += 1;
      bucket.totalPnl += Number.isFinite(pnl) ? pnl : 0;
      if (pnl >= 0) {
        bucket.wins += 1;
        bucket.grossProfit += pnl;
      } else {
        bucket.losses += 1;
        bucket.grossLoss += Math.abs(pnl);
        bucket.maxDrawdown = Math.min(bucket.maxDrawdown, pnl);
      }
      buckets.set(regime, bucket);
    }

    return [...buckets.values()].map((bucket) => {
      const count = Math.max(1, bucket.tradeCount);
      const expectancy = bucket.totalPnl / count;
      const winRate = (bucket.wins / count) * 100;
      return {
        ...bucket,
        expectancy,
        winRate,
        profitFactor: bucket.grossLoss === 0 ? null : bucket.grossProfit / bucket.grossLoss,
        strength:
          winRate >= 55 && expectancy > 0
            ? "Strong"
            : expectancy >= 0
              ? "Stable"
              : "Weak",
      };
    });
  }

  async function runRegimeAnalysis({ userId, experimentId }) {
    const experiment = await prisma.run((db) =>
      db.strategyExperiment.findFirst({
        where: { id: experimentId, userId },
        include: {
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { trades: true },
          },
        },
      })
    );

    if (!experiment) {
      const error = new Error("Strategy experiment not found.");
      error.statusCode = 404;
      throw error;
    }

    const latestRun = experiment.runs?.[0] || null;
    const trades = latestRun?.trades || [];
    const regimes = summarizeTradesByRegime(trades);
    const survival = regimes.reduce((acc, item) => {
      acc[item.regime] = item.strength;
      return acc;
    }, {});

    return {
      experimentId,
      runId: latestRun?.id || null,
      generatedAt: new Date().toISOString(),
      regimes,
      survival,
      summary:
        regimes.length === 0
          ? "No regime-tagged trades yet."
          : Object.entries(survival)
              .map(([regime, strength]) => `${regime}: ${strength}`)
              .join("; "),
    };
  }

  return {
    runRegimeAnalysis,
    summarizeTradesByRegime,
  };
}

module.exports = {
  createRegimeAnalysisService,
};
