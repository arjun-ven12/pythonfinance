function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeKey(value, fallback = "") {
  return String(value || fallback).trim();
}

function normalizeMatrixKey(sector, regime) {
  return `${normalizeKey(sector, "UNKNOWN")}::${normalizeKey(regime, "UNKNOWN")}`;
}

function normalizeSymbolList(values = []) {
  const list = Array.isArray(values)
    ? values
    : String(values || "").split(",");

  return [...new Set(
    list
      .map((value) => String(value || "").trim().toUpperCase())
      .filter(Boolean)
  )];
}

function createMatrixReplayService({
  appendOutput,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  spawn,
  strategyStorage,
}) {
  async function runMatrixReplayPython(config) {
    return new Promise((resolve, reject) => {
      const script = [
        "import json, sys",
        "from matrix_replay import run_matrix_replay",
        "config = json.loads(sys.argv[1])",
        "result = run_matrix_replay(config)",
        "print(json.dumps({'config': config, 'result': result}))",
      ].join("\n");

      const child = spawn(getPythonPath(), ["-c", script, JSON.stringify(config)], {
        cwd: pythonEngineDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

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
          const error = new Error(getProcessFailureMessage("Matrix replay failed", stderr));
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

  async function loadDeploymentReplayContext(userId, matrixOverride = null) {
    const deploymentSet = await prisma.run((db) =>
      db.strategyDeploymentSet.findUnique({
        where: { userId },
        include: {
          routes: {
            orderBy: [
              { sector: "asc" },
              { regime: "asc" },
            ],
          },
          capitalAllocations: true,
          snapshots: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      })
    );

    if (!deploymentSet) {
      throw new Error("No deployment set found for this user.");
    }

    const sourceRoutes = Array.isArray(matrixOverride?.cells) ? matrixOverride.cells : (deploymentSet.routes || []);
    const routeExperimentIds = [...new Set(
      sourceRoutes
        .map((route) => route.selectedExperimentId)
        .filter(Boolean)
    )];
    const routeVersionIds = [...new Set(
      sourceRoutes
        .map((route) => route.selectedStrategyVersionId)
        .filter(Boolean)
        .concat(deploymentSet.ownerStrategyVersionId ? [deploymentSet.ownerStrategyVersionId] : [])
    )];

    const [experimentRecords, versionRecords] = await Promise.all([
      routeExperimentIds.length
        ? prisma.run((db) =>
            db.strategyExperiment.findMany({
              where: { userId, id: { in: routeExperimentIds } },
              include: {
                versions: {
                  orderBy: { version: "desc" },
                  take: 1,
                },
              },
            })
          )
        : Promise.resolve([]),
      routeVersionIds.length
        ? prisma.run((db) =>
            db.strategyVersion.findMany({
              where: { userId, id: { in: routeVersionIds } },
              include: {
                experiment: {
                  include: {
                    versions: {
                      orderBy: { version: "desc" },
                      take: 1,
                    },
                  },
                },
              },
            })
          )
        : Promise.resolve([]),
    ]);

    const experiments = experimentRecords.map((record) =>
      strategyStorage.hydrateStrategyExperimentRecord(record)
    );
    const versions = versionRecords.map((record) =>
      strategyStorage.hydrateStrategyVersionRecord(record)
    );

    const latestVersionByExperimentId = new Map(
      experiments.map((experiment) => [
        experiment.id,
        experiment.versions?.[0] || null,
      ])
    );
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const experimentById = new Map(experiments.map((experiment) => [experiment.id, experiment]));

    const strategies = [];
    const strategyLookup = {};
    for (const route of sourceRoutes) {
      const selectedVersion =
        (route.selectedStrategyVersionId && versionById.get(route.selectedStrategyVersionId)) ||
        (route.selectedExperimentId && latestVersionByExperimentId.get(route.selectedExperimentId)) ||
        null;
      const experiment =
        (selectedVersion && selectedVersion.experiment) ||
        (route.selectedExperimentId ? experimentById.get(route.selectedExperimentId) : null) ||
        null;
      const strategyJson =
        selectedVersion?.strategyJson ||
        experiment?.settingsJson?.strategyJson ||
        null;

      if (!strategyJson) {
        continue;
      }

      const strategyKey = selectedVersion?.id || experiment?.id || normalizeMatrixKey(route.sector, route.regime);
      const strategyConfig = {
        key: String(strategyKey),
        experimentId: experiment?.id || route.selectedExperimentId || null,
        strategyVersionId: selectedVersion?.id || route.selectedStrategyVersionId || null,
        version: selectedVersion?.version || experiment?.versions?.[0]?.version || null,
        name: experiment?.name || selectedVersion?.experiment?.name || route.strategyName || "Strategy",
        status: route.status || "SIT_OUT",
        allocationPct: Number(route.allocationPct || 0),
        maxAllocationPct: Number(
          experiment?.settingsJson?.validation?.maxPositionSize ||
          selectedVersion?.settingsJson?.validation?.maxPositionSize ||
          100
        ),
        strategyJson: deepClone(strategyJson),
        settingsJson: deepClone(selectedVersion?.settingsJson || experiment?.settingsJson || {}),
      };

      strategies.push(strategyConfig);
      strategyLookup[strategyConfig.key] = strategyConfig;
      if (strategyConfig.experimentId) {
        strategyLookup[String(strategyConfig.experimentId)] = strategyConfig;
      }
      if (strategyConfig.strategyVersionId) {
        strategyLookup[String(strategyConfig.strategyVersionId)] = strategyConfig;
      }
    }

    const matrixCells = sourceRoutes.map((route) => ({
      key: normalizeMatrixKey(route.sector, route.regime),
      sector: route.sector,
      regime: route.regime,
      selectedExperimentId: route.selectedExperimentId || null,
      selectedStrategyVersionId: route.selectedStrategyVersionId || null,
      strategyKey:
        route.selectedStrategyVersionId ||
        route.selectedExperimentId ||
        normalizeMatrixKey(route.sector, route.regime),
      strategyName: route.selectedExperimentId
        ? experimentById.get(route.selectedExperimentId)?.name || route.strategyName || null
        : route.strategyName || null,
      allocationPct: Number(route.allocationPct || 0),
      status: route.status || "SIT_OUT",
      evidenceStatus: route.evidenceStatus || "Sit out",
    }));

    return {
      deploymentSet,
      strategyLookup,
      strategies,
      matrix: {
        sectors: [...new Set(matrixCells.map((cell) => cell.sector))],
        regimes: [...new Set(matrixCells.map((cell) => cell.regime))],
        cells: matrixCells,
      },
    };
  }

  async function runMatrixReplay({ userId, body = {}, matrixOverride = null }) {
    const { deploymentSet, strategyLookup, strategies, matrix } =
      await loadDeploymentReplayContext(userId, matrixOverride);

    const symbols = normalizeSymbolList(
      body.symbols || body.symbolList || body.symbol || []
    );

    if (!symbols.length) {
      throw new Error("Matrix replay requires at least one symbol.");
    }

    const universeSymbols = normalizeSymbolList(body.universeSymbols || symbols);
    const universeMembers = Array.isArray(body.universeMembers)
      ? body.universeMembers
      : [];

    const symbolMetadata = new Map(
      universeMembers
        .map((member) => ({
          symbol: String(member?.symbol || "").trim().toUpperCase(),
          sector: member?.sector || null,
          industry: member?.industry || null,
        }))
        .filter((member) => member.symbol)
        .map((member) => [member.symbol, member])
    );

    const replayConfig = {
      deployment: {
        deploymentSetId: deploymentSet.id,
        deploymentVersionId: deploymentSet.id,
        ownerExperimentId: deploymentSet.ownerExperimentId || null,
        ownerStrategyVersionId: deploymentSet.ownerStrategyVersionId || null,
        matrix,
      },
      strategies,
      universe: {
        symbols: universeSymbols.map((symbol) => ({
          symbol,
          ...(symbolMetadata.get(symbol) || {}),
        })),
      },
      symbols,
      period: body.period || "2y",
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      benchmark: body.benchmark || "SPY",
      initialCash: Number(body.initialCash || body.initial_cash || 100000),
      feePerTrade: Number(body.feePerTrade || body.fee_per_trade || 1),
      executionAssumptions: body.executionAssumptions || {},
      positionSizing: body.positionSizing || {},
      indicatorConfiguration: body.indicatorConfiguration || null,
      riskPerTrade: Number(body.riskPerTrade || 0.01),
    };

    return runMatrixReplayPython(replayConfig);
  }

  return {
    loadDeploymentReplayContext,
    runMatrixReplay,
  };
}

module.exports = {
  createMatrixReplayService,
};
