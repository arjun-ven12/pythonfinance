const {
  getDefaultStrategyStorageService,
} = require("./strategyStorage.service");

function createStrategyMemoryService({
  prisma,
  strategyStorage = getDefaultStrategyStorageService(),
}) {
  function diffSettings(previous = {}, next = {}) {
    const keys = [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])];
    return keys
      .filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key]))
      .map((key) => ({
        key,
        before: previous?.[key] ?? null,
        after: next?.[key] ?? null,
      }));
  }

  async function getStrategyMemory({ userId, experimentId }) {
    const experimentRecord = await prisma.run((db) =>
      db.strategyExperiment.findFirst({
        where: { id: experimentId, userId },
        include: {
          versions: { orderBy: { version: "asc" } },
          runs: { orderBy: { createdAt: "asc" } },
          walkForwardRuns: { orderBy: { createdAt: "asc" } },
          stressResults: { orderBy: { createdAt: "asc" } },
        },
      })
    );
    const experiment = strategyStorage.hydrateStrategyExperimentRecord(experimentRecord);

    if (!experiment) {
      const error = new Error("Strategy experiment not found.");
      error.statusCode = 404;
      throw error;
    }

    const timeline = experiment.versions.map((version, index) => {
      const previous = experiment.versions[index - 1];
      return {
        id: version.id,
        version: version.version,
        createdAt: version.createdAt,
        changeNote: version.changeNote,
        changed: previous
          ? diffSettings(previous.settingsJson || {}, version.settingsJson || {})
          : [],
      };
    });

    return {
      experiment: {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
      },
      timeline,
      performanceDeltas: experiment.runs.map((run, index) => {
        const previous = experiment.runs[index - 1];
        return {
          runId: run.id,
          createdAt: run.createdAt,
          returnPct: run.returnPct,
          sharpe: run.sharpe,
          returnDelta: previous && run.returnPct !== null && previous.returnPct !== null
            ? Number((run.returnPct - previous.returnPct).toFixed(4))
            : null,
          sharpeDelta: previous && run.sharpe !== null && previous.sharpe !== null
            ? Number((run.sharpe - previous.sharpe).toFixed(4))
            : null,
        };
      }),
      evidence: {
        walkForwardRuns: experiment.walkForwardRuns.length,
        stressTests: experiment.stressResults.length,
      },
    };
  }

  return { getStrategyMemory, diffSettings };
}

module.exports = {
  createStrategyMemoryService,
};
