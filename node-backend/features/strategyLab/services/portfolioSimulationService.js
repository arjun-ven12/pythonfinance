function createPortfolioSimulationService({ prisma }) {
  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function buildWeights(experiments, allocationMode, customWeights = {}) {
    if (allocationMode === "CUSTOM") {
      const total = experiments.reduce(
        (sum, experiment) => sum + Math.max(0, toNumber(customWeights[experiment.id])),
        0
      );
      if (total > 0) {
        return Object.fromEntries(
          experiments.map((experiment) => [
            experiment.id,
            Math.max(0, toNumber(customWeights[experiment.id])) / total,
          ])
        );
      }
    }

    if (allocationMode === "RISK_PARITY") {
      const inverseRisk = experiments.map((experiment) => {
        const drawdown = Math.max(1, Math.abs(toNumber(experiment.runs?.[0]?.maxDrawdown, 20)));
        return { id: experiment.id, weight: 1 / drawdown };
      });
      const total = inverseRisk.reduce((sum, item) => sum + item.weight, 0);
      return Object.fromEntries(inverseRisk.map((item) => [item.id, item.weight / total]));
    }

    const weight = experiments.length ? 1 / experiments.length : 0;
    return Object.fromEntries(experiments.map((experiment) => [experiment.id, weight]));
  }

  function buildReturnSeries(curve = []) {
    const returns = [];
    for (let index = 1; index < curve.length; index += 1) {
      const previous = Number(curve[index - 1]?.equity);
      const current = Number(curve[index]?.equity);
      if (Number.isFinite(previous) && Number.isFinite(current) && previous > 0) {
        returns.push((current - previous) / previous);
      }
    }
    return returns;
  }

  function computeCorrelation(curveA = [], curveB = []) {
    const seriesA = buildReturnSeries(curveA);
    const seriesB = buildReturnSeries(curveB);
    const length = Math.min(seriesA.length, seriesB.length);
    if (length < 2) return null;
    const a = seriesA.slice(0, length);
    const b = seriesB.slice(0, length);
    const avgA = a.reduce((sum, value) => sum + value, 0) / length;
    const avgB = b.reduce((sum, value) => sum + value, 0) / length;
    const numerator = a.reduce((sum, value, index) => sum + ((value - avgA) * (b[index] - avgB)), 0);
    const varA = a.reduce((sum, value) => sum + ((value - avgA) ** 2), 0);
    const varB = b.reduce((sum, value) => sum + ((value - avgB) ** 2), 0);
    if (varA <= 0 || varB <= 0) return null;
    return numerator / Math.sqrt(varA * varB);
  }

  function calculateMaxDrawdown(curve = []) {
    let peak = 0;
    let maxDrawdown = 0;
    for (const point of curve) {
      const equity = Number(point?.equity);
      if (!Number.isFinite(equity)) continue;
      peak = Math.max(peak, equity);
      if (peak > 0) {
        maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
      }
    }
    return maxDrawdown;
  }

  function combineCurves(experiments, weights) {
    const curves = experiments
      .map((experiment) => ({
        id: experiment.id,
        curve: experiment.runs?.[0]?.settingsJson?.equity_curve || [],
      }))
      .filter((item) => item.curve.length > 0);

    if (curves.length === 0) return [];

    const minLength = Math.min(...curves.map((item) => item.curve.length));
    const firstBase = curves.reduce((sum, item) => sum + ((weights[item.id] || 0) * Number(item.curve[0]?.equity || 100)), 0) || 100;
    return Array.from({ length: minLength }, (_unused, index) => {
      const equity = curves.reduce((sum, item) => {
        const point = item.curve[index];
        const first = item.curve[0]?.equity || 1;
        const normalized = first ? Number(point?.equity || first) / first : 1;
        return sum + normalized * (weights[item.id] || 0);
      }, 0);
      return {
        date: curves[0].curve[index]?.date || String(index + 1),
        equity: Number((equity * firstBase).toFixed(2)),
      };
    });
  }

  async function simulateStrategyPortfolio({ userId, body = {} }) {
    const ids = Array.isArray(body.experimentIds)
      ? body.experimentIds.map(String).filter(Boolean)
      : [];
    const allocationMode = String(body.allocationMode || "EQUAL").toUpperCase();

    if (ids.length < 2) {
      throw new Error("Choose at least two strategies for portfolio simulation.");
    }

    const experiments = await prisma.run((db) =>
      db.strategyExperiment.findMany({
        where: {
          userId,
          id: { in: ids },
        },
        include: {
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      })
    );

    if (experiments.length < 2) {
      throw new Error("At least two selected strategies need to belong to this user.");
    }

    const weights = buildWeights(experiments, allocationMode, body.weights || {});
    const combinedReturn = experiments.reduce(
      (sum, experiment) => sum + toNumber(experiment.runs?.[0]?.returnPct) * (weights[experiment.id] || 0),
      0
    );
    const combinedSharpe = experiments.reduce(
      (sum, experiment) => sum + toNumber(experiment.runs?.[0]?.sharpe) * (weights[experiment.id] || 0),
      0
    );
    const equityCurve = combineCurves(experiments, weights);
    const combinedDrawdown = calculateMaxDrawdown(equityCurve);
    const pairwiseCorrelations = [];
    for (let left = 0; left < experiments.length; left += 1) {
      for (let right = left + 1; right < experiments.length; right += 1) {
        const correlation = computeCorrelation(
          experiments[left].runs?.[0]?.settingsJson?.equity_curve || [],
          experiments[right].runs?.[0]?.settingsJson?.equity_curve || []
        );
        if (Number.isFinite(correlation)) {
          pairwiseCorrelations.push(correlation);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      allocationMode,
      strategies: experiments.map((experiment) => ({
        id: experiment.id,
        name: experiment.name,
        weight: weights[experiment.id] || 0,
        returnPct: experiment.runs?.[0]?.returnPct ?? null,
        sharpe: experiment.runs?.[0]?.sharpe ?? null,
        maxDrawdown: experiment.runs?.[0]?.maxDrawdown ?? null,
      })),
      metrics: {
        combinedReturn: Number(combinedReturn.toFixed(2)),
        combinedSharpe: Number(combinedSharpe.toFixed(2)),
        combinedDrawdown: Number(combinedDrawdown.toFixed(2)),
        capitalUsage: 100,
        correlation: pairwiseCorrelations.length
          ? Number((pairwiseCorrelations.reduce((sum, value) => sum + value, 0) / pairwiseCorrelations.length).toFixed(4))
          : null,
      },
      equityCurve,
    };
  }

  return {
    buildWeights,
    simulateStrategyPortfolio,
  };
}

module.exports = {
  createPortfolioSimulationService,
};
