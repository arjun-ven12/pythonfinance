function createMonteCarloService({ prisma }) {
  function createRandom(seed) {
    let state = seed || 42;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  function shuffle(values, random) {
    const items = [...values];
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  function runSimulation(tradeReturns, random, options = {}) {
    const slippage = Number(options.slippagePct || 0.15) / 100;
    const partialFillProbability = Number(options.partialFillProbability || 0.1);
    let equity = 100;
    let peak = 100;
    let maxDrawdown = 0;

    for (const tradeReturn of shuffle(tradeReturns, random)) {
      const delayPenalty = (random() - 0.5) * slippage;
      const fillRatio = random() < partialFillProbability ? 0.5 + random() * 0.4 : 1;
      equity *= 1 + ((tradeReturn / 100) - delayPenalty) * fillRatio;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, ((equity - peak) / peak) * 100);
    }

    return {
      returnPct: equity - 100,
      maxDrawdown,
      ruined: equity <= 70,
      drawdown20: maxDrawdown <= -20,
    };
  }

  function summarizeSimulations(simulations) {
    const sortedReturns = [...simulations].sort((a, b) => a.returnPct - b.returnPct);
    const percentile = (ratio) => {
      if (sortedReturns.length === 0) return null;
      const index = Math.min(sortedReturns.length - 1, Math.max(0, Math.floor((sortedReturns.length - 1) * ratio)));
      return sortedReturns[index].returnPct;
    };
    const averageReturn =
      sortedReturns.reduce((sum, item) => sum + item.returnPct, 0) /
      Math.max(1, sortedReturns.length);

    return {
      worstReturn: percentile(0),
      medianReturn: percentile(0.5),
      bestReturn: percentile(1),
      riskOfRuin:
        (simulations.filter((item) => item.ruined).length / Math.max(1, simulations.length)) * 100,
      probability20Drawdown:
        (simulations.filter((item) => item.drawdown20).length / Math.max(1, simulations.length)) * 100,
      expectedCagr: averageReturn,
      simulations,
    };
  }

  async function runMonteCarloStress({ userId, experimentId, body = {} }) {
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
    const tradeReturns = trades
      .map((trade) => Number(trade.returnPct ?? trade.raw?.return_pct ?? 0))
      .filter(Number.isFinite);

    if (tradeReturns.length === 0) {
      throw new Error("Run at least one backtest with persisted trades before stress testing.");
    }

    const simulationCount = Math.min(1000, Math.max(100, Number(body.simulationCount || 500)));
    const random = createRandom(Number(body.seed || 42));
    const simulations = Array.from({ length: simulationCount }, () =>
      runSimulation(tradeReturns, random, body)
    );
    const summary = summarizeSimulations(simulations);
    const persisted = await prisma.run((db) =>
      db.strategyStressResult.create({
        data: {
          userId,
          experimentId,
          simulationCount,
          bestReturn: summary.bestReturn,
          medianReturn: summary.medianReturn,
          worstReturn: summary.worstReturn,
          riskOfRuin: summary.riskOfRuin,
          probability20Drawdown: summary.probability20Drawdown,
          expectedCagr: summary.expectedCagr,
          resultJson: {
            runId: latestRun?.id || null,
            tradeCount: tradeReturns.length,
            assumptions: body,
            sample: simulations.slice(0, 100),
          },
        },
      })
    );

    return { stressResult: persisted, summary };
  }

  return {
    runMonteCarloStress,
    runSimulation,
    summarizeSimulations,
  };
}

module.exports = {
  createMonteCarloService,
};
