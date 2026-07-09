const {
  computeOutOfRegimeStability,
} = require("./strategyConditioningService");

function createWalkForwardService({
  appendOutput,
  buildExperimentBacktestConfig,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  runBacktest,
  spawn,
}) {
  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getDefaultWindows(body = {}) {
    return {
      trainStart: body.trainStart || "2020-01-01",
      trainEnd: body.trainEnd || "2022-12-31",
      validateStart: body.validateStart || "2023-01-01",
      validateEnd: body.validateEnd || "2023-12-31",
      testStart: body.testStart || "2024-01-01",
      testEnd: body.testEnd || new Date().toISOString().slice(0, 10),
    };
  }

  function normalizeMode(value) {
    const mode = String(value || "ANCHORED").trim().toUpperCase();
    return ["ANCHORED", "EXPANDING", "ROLLING", "WINDOW_SHIFT"].includes(mode)
      ? mode
      : "ANCHORED";
  }

  function runPythonWalkForward(config) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        getPythonPath(),
        ["walk_forward_engine.py", "--config", JSON.stringify(config)],
        {
          cwd: pythonEngineDir,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", reject);

      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error(getProcessFailureMessage("Walk-forward test failed", stderr));
          error.details = { code, stdout, stderr };
          reject(error);
          return;
        }

        try {
          resolve(parseJsonOutput(stdout));
        } catch (error) {
          error.details = { stdout, stderr };
          reject(error);
        }
      });
    });
  }

  async function runWalkForward({ userId, experiment, body = {} }) {
    const mode = normalizeMode(body.mode);
    const windows = getDefaultWindows(body);
    const config = buildExperimentBacktestConfig(experiment, {
      ...body,
      period: body.period || "5y",
      startDate: windows.trainStart,
      endDate: windows.testEnd,
    });
    const payload = {
      ...config,
      ...windows,
      mode,
      benchmark: body.benchmark || config.benchmark || "SPY",
      initial_cash: Number(body.initialCash || 1000),
      risk_per_trade: config.riskPerTrade,
      strategy_config: config.strategyConfig,
      horizon_profile: config.horizonProfile,
    };
    let result;

    if (body.useNodeBacktest === true) {
      const segments = [];
      const segmentWindows = [
        { phase: "TRAIN", startDate: windows.trainStart, endDate: windows.trainEnd },
        { phase: "VALIDATE", startDate: windows.validateStart, endDate: windows.validateEnd },
        { phase: "TEST", startDate: windows.testStart, endDate: windows.testEnd },
      ];
      for (const [index, window] of segmentWindows.entries()) {
        const output = await runBacktest({
          ...config,
          startDate: window.startDate,
          endDate: window.endDate,
        });
        segments.push({
          segmentIndex: index,
          phase: window.phase,
          startDate: window.startDate,
          endDate: window.endDate,
          returnPct: output.result?.total_return_pct ?? null,
          sharpe: output.result?.sharpe_ratio ?? null,
          maxDrawdown: output.result?.max_drawdown_pct ?? null,
          tradeCount: output.result?.completed_trades ?? null,
          metrics: output.result || {},
        });
      }
      result = buildWalkForwardSummary({ mode, segments });
    } else {
      result = await runPythonWalkForward(payload);
    }

    const summary = result.summary || {};
    const persisted = await prisma.run(async (db) => {
      const created = await db.walkForwardRun.create({
        data: {
          userId,
          experimentId: experiment.id,
          mode,
          trainStart: parseDate(windows.trainStart),
          trainEnd: parseDate(windows.trainEnd),
          validateStart: parseDate(windows.validateStart),
          validateEnd: parseDate(windows.validateEnd),
          testStart: parseDate(windows.testStart),
          testEnd: parseDate(windows.testEnd),
          oosReturn: toNullableNumber(summary.oosReturn),
          oosSharpe: toNullableNumber(summary.oosSharpe),
          oosDrawdown: toNullableNumber(summary.oosDrawdown),
          overfitRatio: toNullableNumber(summary.overfitRatio),
          returnDecay: toNullableNumber(summary.returnDecay),
          stabilityScore: toNullableNumber(summary.stabilityScore),
          summaryJson: summary,
        },
      });

      if (Array.isArray(result.segments) && result.segments.length > 0) {
        await db.walkForwardSegment.createMany({
          data: result.segments.map((segment) => ({
            walkForwardRunId: created.id,
            segmentIndex: Number(segment.segmentIndex || 0),
            phase: String(segment.phase || "TEST").toUpperCase(),
            startDate: parseDate(segment.startDate),
            endDate: parseDate(segment.endDate),
            returnPct: toNullableNumber(segment.returnPct),
            sharpe: toNullableNumber(segment.sharpe),
            maxDrawdown: toNullableNumber(segment.maxDrawdown),
            tradeCount: Number.isInteger(Number(segment.tradeCount))
              ? Number(segment.tradeCount)
              : null,
            metricsJson: segment.metrics || {},
          })),
        });
      }

      const metricRows = Object.entries(summary)
        .filter(([_key, value]) => Number.isFinite(Number(value)))
        .map(([metricName, value]) => ({
          walkForwardRunId: created.id,
          metricName,
          metricValue: Number(value),
          metadata: { mode },
        }));
      if (metricRows.length > 0) {
        await db.walkForwardMetric.createMany({ data: metricRows });
      }

      return db.walkForwardRun.findFirst({
        where: { id: created.id, userId },
        include: {
          segments: { orderBy: { segmentIndex: "asc" } },
          metrics: true,
        },
      });
    });

    return { result, walkForwardRun: persisted };
  }

  return { runWalkForward };
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildWalkForwardSummary({ mode, segments }) {
  const trainValidate = segments.filter((item) => ["TRAIN", "VALIDATE"].includes(item.phase));
  const test = segments.filter((item) => item.phase === "TEST");
  const average = (items, key) => {
    const values = items.map((item) => Number(item[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  };
  const isReturn = average(trainValidate, "returnPct");
  const oosReturn = average(test, "returnPct");
  const oosDrawdown = average(test, "maxDrawdown");
  const returnDecay = isReturn - oosReturn;
  const stabilityScore = Math.max(0, Math.min(100, 85 - Math.abs(returnDecay) - Math.max(0, Math.abs(oosDrawdown) - 15)));

  const outOfRegimeStability = computeOutOfRegimeStability({ segments });

  return {
    mode,
    segments,
    summary: {
      isReturn,
      oosReturn,
      oosSharpe: average(test, "sharpe"),
      oosDrawdown,
      overfitRatio: oosReturn ? Math.abs(isReturn / oosReturn) : null,
      returnDecay,
      stabilityScore,
      rating: stabilityScore >= 75 ? "Stable" : stabilityScore >= 55 ? "Moderate" : "Fragile",
      outOfRegimeStability,
    },
  };
}

module.exports = {
  createWalkForwardService,
  buildWalkForwardSummary,
};
