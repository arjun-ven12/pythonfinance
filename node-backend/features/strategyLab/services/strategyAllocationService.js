const {
  buildAllocationMatrixEvidence,
} = require("./strategyConditioningService");

const DEFAULT_GUARDRAILS = {
  minimumTrades: 30,
  minimumValidationScore: 55,
  minimumRobustness: 60,
  minimumWalkForwardStability: 55,
  maxStrategyAllocationPct: 35,
  maxSectorExposurePct: 45,
};

const {
  getDefaultStrategyStorageService,
} = require("./strategyStorage.service");
const {
  upsertCanonicalDeploymentRecord,
} = require("./strategyLifecycleService");

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const numeric = toNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(digits));
}

function average(values = []) {
  const numbers = values.map((value) => toNumber(value)).filter((value) => value !== null);
  if (!numbers.length) {
    return null;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sum(values = []) {
  return values.reduce((total, value) => total + (toNumber(value, 0) || 0), 0);
}

function normalizeMatrixKey(sector, regime) {
  return `${String(sector || "UNKNOWN").trim()}::${String(regime || "UNKNOWN").trim()}`;
}

function normalizeMethod(method) {
  const value = String(method || "EQUAL_WEIGHT").trim().toUpperCase();
  const aliases = {
    EQUAL: "EQUAL_WEIGHT",
    CUSTOM: "MANUAL_WEIGHT",
    MANUAL: "MANUAL_WEIGHT",
    RISK_PARITY: "RISK_PARITY",
    CONFIDENCE: "CONFIDENCE_WEIGHTED",
    EVIDENCE: "EVIDENCE_WEIGHTED",
    VOLATILITY: "VOLATILITY_ADJUSTED",
  };
  return aliases[value] || value;
}

function mergeGuardrails(guardrails = {}) {
  return {
    ...DEFAULT_GUARDRAILS,
    ...Object.fromEntries(
      Object.entries(guardrails || {}).filter(([, value]) => value !== undefined && value !== null)
    ),
  };
}

function validateGuardrailConfig(guardrails) {
  const errors = [];
  if (!Number.isInteger(Number(guardrails.minimumTrades)) || Number(guardrails.minimumTrades) < 0) {
    errors.push("Minimum trades must be a non-negative whole number.");
  }
  for (const [field, label] of [
    ["minimumValidationScore", "Minimum validation"],
    ["minimumRobustness", "Minimum robustness"],
    ["minimumWalkForwardStability", "Minimum walk-forward stability"],
    ["maxStrategyAllocationPct", "Maximum strategy allocation"],
    ["maxSectorExposurePct", "Maximum sector exposure"],
  ]) {
    const value = Number(guardrails[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${label} must be between 0% and 100%.`);
    }
  }
  return errors;
}

function buildMethodInputs(strategy) {
  const validationScore = toNumber(strategy.validationScore, 0) || 0;
  const evidenceCount = toNumber(strategy.evidenceCount, 0) || 0;
  const volatility = Math.abs(toNumber(strategy.volatility, 0) || 0);
  const drawdown = Math.abs(toNumber(strategy.expectedDrawdown, 0) || 0);

  return {
    equal: 1,
    riskParity: drawdown > 0 ? 1 / Math.max(drawdown, 1) : 1,
    confidence: Math.max(validationScore, 1),
    evidence: Math.max(evidenceCount, 1),
    volatilityAdjusted: volatility > 0 ? 1 / Math.max(volatility, 0.01) : 1,
  };
}

function buildAllocationWeights(strategies = [], method, manualWeights = {}) {
  const normalizedMethod = normalizeMethod(method);
  const eligible = strategies.filter((strategy) => strategy.status !== "BLOCKED");

  if (!eligible.length) {
    return {};
  }

  if (normalizedMethod === "MANUAL_WEIGHT") {
    const total = eligible.reduce(
      (runningTotal, strategy) => runningTotal + Math.max(0, toNumber(manualWeights[strategy.experimentId], 0) || 0),
      0
    );
    if (total <= 0) {
      return {};
    }
    return Object.fromEntries(
      eligible.map((strategy) => [
        strategy.experimentId,
        (Math.max(0, toNumber(manualWeights[strategy.experimentId], 0) || 0) / total) * 100,
      ])
    );
  }

  const weighted = eligible.map((strategy) => {
    const inputs = buildMethodInputs(strategy);
    const weight = {
      EQUAL_WEIGHT: inputs.equal,
      RISK_PARITY: inputs.riskParity,
      CONFIDENCE_WEIGHTED: inputs.confidence,
      EVIDENCE_WEIGHTED: inputs.evidence,
      VOLATILITY_ADJUSTED: inputs.volatilityAdjusted,
    }[normalizedMethod] || inputs.equal;
    return {
      experimentId: strategy.experimentId,
      weight: Math.max(weight, 0),
    };
  });

  const total = sum(weighted.map((entry) => entry.weight));
  if (total <= 0) {
    return {};
  }

  return Object.fromEntries(
    weighted.map((entry) => [entry.experimentId, round((entry.weight / total) * 100, 4)])
  );
}

function buildGuardrailViolations(strategy, guardrails) {
  const violations = [];
  if (!strategy.hasValidatedEvidence) {
    violations.push("Strategy not validated");
  }
  if (!strategy.walkForwardPassed) {
    violations.push("Walk-forward failed");
  }
  if (!strategy.robustnessPassed) {
    violations.push("Robustness fragile");
  }
  if (!strategy.tradeCountPassed) {
    violations.push("Trade count too low");
  }
  if (!strategy.validationScorePassed) {
    violations.push("Validation confidence too low");
  }
  if ((toNumber(strategy.assignedCapitalPct, 0) || 0) > Math.min(strategy.maxAllocationPct, guardrails.maxStrategyAllocationPct)) {
    violations.push("Allocation exceeds max risk");
  }
  return violations;
}

function validateAllocationPlan({ strategies = [], matrixCells = [], guardrails = DEFAULT_GUARDRAILS }) {
  const mergedGuardrails = mergeGuardrails(guardrails);
  const errors = [];
  const totalAssigned = round(sum(strategies.map((strategy) => strategy.assignedCapitalPct)), 4) || 0;
  const seenMatrixKeys = new Set();

  if (totalAssigned > 100.0001) {
    errors.push("Allocations must sum to 100% or less.");
  }

  const sectorExposure = {};
  for (const cell of matrixCells) {
    const normalizedKey = cell.key || normalizeMatrixKey(cell.sector, cell.regime);
    if (seenMatrixKeys.has(normalizedKey)) {
      errors.push(`Only one strategy route is allowed for ${normalizedKey}.`);
      continue;
    }
    seenMatrixKeys.add(normalizedKey);

    const allocationPct = toNumber(cell.allocationPct, 0) || 0;
    const selectedExperimentId = cell.selectedExperimentId || null;
    if (cell.status === "SIT_OUT") {
      if (selectedExperimentId || allocationPct > 0) {
        errors.push(`Sit-out cell ${normalizedKey} cannot include a strategy or allocation.`);
      }
      continue;
    }
    if (!selectedExperimentId) {
      errors.push(`Active or pending cell ${normalizedKey} requires a strategy.`);
      continue;
    }
    sectorExposure[cell.sector] = (sectorExposure[cell.sector] || 0) + allocationPct;
  }

  Object.entries(sectorExposure).forEach(([sector, exposure]) => {
    if (exposure > mergedGuardrails.maxSectorExposurePct) {
      errors.push(`${sector} exposure exceeds the ${mergedGuardrails.maxSectorExposurePct}% guardrail.`);
    }
  });

  strategies.forEach((strategy) => {
    if ((toNumber(strategy.assignedCapitalPct, 0) || 0) <= 0) {
      return;
    }
    buildGuardrailViolations(strategy, mergedGuardrails).forEach((violation) => {
      errors.push(`${strategy.name}: ${violation}.`);
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    totalAssigned,
    sectorExposure,
  };
}

function buildAllocationAuditEntries({
  actorUserId,
  deploymentSetId,
  previousAllocations = [],
  nextAllocations = [],
  reasonNote = "",
  userId,
}) {
  const previousByExperimentId = new Map(
    previousAllocations.map((allocation) => [allocation.experimentId, allocation])
  );

  return nextAllocations
    .filter((allocation) => {
      const previous = previousByExperimentId.get(allocation.experimentId);
      return (
        round(previous?.assignedCapitalPct || 0, 4) !== round(allocation.assignedCapitalPct || 0, 4) ||
        round(previous?.maxAllocationPct || 0, 4) !== round(allocation.maxAllocationPct || 0, 4) ||
        String(previous?.status || "") !== String(allocation.status || "")
      );
    })
    .map((allocation) => ({
      userId,
      deploymentSetId,
      actorUserId,
      experimentId: allocation.experimentId,
      action: "ALLOCATION_UPDATED",
      previousAllocation: previousByExperimentId.get(allocation.experimentId) || null,
      newAllocation: allocation,
      reasonNote: reasonNote || null,
    }));
}

function buildStrategyMatrixFromRoutes(routes = [], envelope = {}, allocationMatrix = {}) {
  return buildAllocationMatrixEvidence({
    cellBreakdown: routes.map((route) => ({
      sector: route.sector,
      regime: route.regime,
      sampleCount: route.sampleCount,
      hitRate: route.hitRate,
      realizedReturn: route.realizedReturn,
    })),
    envelope,
    allocationMatrix,
  });
}

function buildAllocationSimulation({ strategies = [], matrixCells = [] }) {
  const activeStrategies = strategies.filter((strategy) => (toNumber(strategy.assignedCapitalPct, 0) || 0) > 0);
  const weighted = activeStrategies.map((strategy) => ({
    ...strategy,
    weight: (toNumber(strategy.assignedCapitalPct, 0) || 0) / 100,
  }));

  const expectedReturn = weighted.reduce(
    (total, strategy) => total + (toNumber(strategy.expectedReturn, 0) || 0) * strategy.weight,
    0
  );
  const expectedDrawdown = weighted.reduce(
    (total, strategy) => total + Math.abs(toNumber(strategy.expectedDrawdown, 0) || 0) * strategy.weight,
    0
  );
  const sharpe = weighted.reduce(
    (total, strategy) => total + (toNumber(strategy.sharpe, 0) || 0) * strategy.weight,
    0
  );

  const sectorExposure = {};
  const regimeExposure = {};
  matrixCells.forEach((cell) => {
    const allocationPct = toNumber(cell.allocationPct, 0) || 0;
    if (allocationPct <= 0) {
      return;
    }
    sectorExposure[cell.sector] = (sectorExposure[cell.sector] || 0) + allocationPct;
    regimeExposure[cell.regime] = (regimeExposure[cell.regime] || 0) + allocationPct;
  });

  const overlap = round(
    average(
      weighted.map((strategy) =>
        round(
          ((strategy.routedSectors?.length || 0) + (strategy.routedRegimes?.length || 0)) / 2,
          2
        )
      )
    ),
    2
  );

  return {
    metrics: {
      expectedReturn: round(expectedReturn),
      expectedDrawdown: round(expectedDrawdown),
      sharpe: round(sharpe),
      capitalUsage: round(sum(activeStrategies.map((strategy) => strategy.assignedCapitalPct))),
      strategyOverlap: overlap,
    },
    sectorExposure: Object.entries(sectorExposure).map(([sector, allocationPct]) => ({
      sector,
      allocationPct: round(allocationPct),
    })),
    regimeExposure: Object.entries(regimeExposure).map(([regime, allocationPct]) => ({
      regime,
      allocationPct: round(allocationPct),
    })),
  };
}

function buildRebalanceSuggestions(previousAllocations = [], nextAllocations = [], maxDriftPct = 5) {
  const previousByExperimentId = new Map(
    previousAllocations.map((allocation) => [allocation.experimentId, allocation])
  );

  const suggestions = nextAllocations
    .map((allocation) => {
      const previous = previousByExperimentId.get(allocation.experimentId);
      const previousPct = toNumber(previous?.assignedCapitalPct, 0) || 0;
      const nextPct = toNumber(allocation.assignedCapitalPct, 0) || 0;
      const drift = Math.abs(nextPct - previousPct);
      if (drift < maxDriftPct) {
        return null;
      }
      return {
        experimentId: allocation.experimentId,
        strategyName: allocation.name,
        driftPct: round(drift),
        action:
          nextPct > previousPct
            ? `Increase allocation by ${round(nextPct - previousPct)}%`
            : `Trim allocation by ${round(previousPct - nextPct)}%`,
      };
    })
    .filter(Boolean);

  return suggestions.length ? suggestions : [{ action: "No rebalance action suggested yet." }];
}

function mergeAllocationMatrixIntoSettings(settings = {}, allocationMatrix = {}) {
  const currentStrategyJson = settings.strategyJson || {};
  return {
    ...settings,
    allocationMatrix,
    strategyJson: {
      ...currentStrategyJson,
      executable: {
        ...(currentStrategyJson.executable || {}),
        allocationMatrix,
      },
    },
  };
}

function getRouteStatus(cell, strategy) {
  if (!strategy) {
    return "SIT_OUT";
  }
  if (!strategy.hasValidatedEvidence) {
    return "PENDING";
  }
  if (!strategy.walkForwardPassed || !strategy.robustnessPassed) {
    return "BLOCKED";
  }
  return "ACTIVE";
}

function mapAuditLog(log) {
  return {
    id: log.id,
    action: log.action,
    reasonNote: log.reasonNote || "",
    previousAllocation: log.previousAllocation || null,
    newAllocation: log.newAllocation || null,
    createdAt: log.createdAt,
    actor: log.actorUser
      ? {
          id: log.actorUser.id,
          email: log.actorUser.email,
          name: log.actorUser.name,
        }
      : null,
    strategyName: log.experiment?.name || null,
  };
}

function createStrategyAllocationService({
  createStrategyVersion,
  getStrategyLifecycleDashboard,
  prisma,
  readActiveStrategyConfig,
  strategyStorage = getDefaultStrategyStorageService(),
  writeActiveStrategyConfig,
}) {
  async function loadStrategyUniverse(userId) {
    const [activeStrategy, dashboard, experimentRecords, deploymentSet] = await Promise.all([
      readActiveStrategyConfig(userId),
      getStrategyLifecycleDashboard({ prisma, userId }),
      prisma.run((db) =>
        db.strategyExperiment.findMany({
          where: { userId },
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
            },
            runs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            walkForwardRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      ),
      prisma.run((db) =>
        db.strategyDeploymentSet.findUnique({
          where: { userId },
          include: {
            routes: true,
            capitalAllocations: true,
            snapshots: {
              orderBy: { createdAt: "desc" },
              take: 2,
            },
            auditLogs: {
              orderBy: { createdAt: "desc" },
              take: 25,
              include: {
                actorUser: {
                  select: { id: true, email: true, name: true },
                },
                experiment: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        })
      ),
    ]);
    const experiments = experimentRecords.map((experiment) =>
      strategyStorage.hydrateStrategyExperimentRecord(experiment)
    );

    return {
      activeStrategy,
      dashboard,
      deploymentSet,
      experiments,
      lifecycleByExperimentId: new Map(
        (dashboard?.strategies || []).map((strategy) => [strategy.experimentId, strategy])
      ),
    };
  }

  function buildStrategyCards({ deploymentSet, experiments, lifecycleByExperimentId, allocationMethod }) {
    const savedAllocationsByExperimentId = new Map(
      (deploymentSet?.capitalAllocations || []).map((allocation) => [allocation.experimentId, allocation])
    );

    const strategies = experiments.map((experiment) => {
      const lifecycle = lifecycleByExperimentId.get(experiment.id) || {};
      const latestRun = experiment.runs?.[0] || lifecycle.latestRun || {};
      const latestWalkForward = experiment.walkForwardRuns?.[0] || lifecycle.latestWalkForward || {};
      const savedAllocation = savedAllocationsByExperimentId.get(experiment.id);
      const validationScore = toNumber(
        lifecycle.realizedPerformance?.averageConfidence ?? lifecycle.realizedPerformance?.hitRate,
        0
      ) || 0;
      const evidenceCount = toNumber(lifecycle.realizedPerformance?.sampleCount, 0) || 0;
      const robustnessScore = toNumber(experiment.settingsJson?.robustness?.score, 0) || 0;
      const walkForwardStability = toNumber(latestWalkForward.stabilityScore, 0) || 0;
      const outOfRegimePass =
        latestWalkForward.summaryJson?.outOfRegimeStability?.pass ??
        latestWalkForward.outOfRegimeStability?.pass ??
        false;
      const hasValidatedEvidence = evidenceCount >= DEFAULT_GUARDRAILS.minimumTrades && validationScore >= 45;
      const routedSectors = Array.isArray(lifecycle.envelope?.sectors) ? lifecycle.envelope.sectors : [];
      const routedRegimes = Array.isArray(lifecycle.envelope?.regimes) ? lifecycle.envelope.regimes : [];

      return {
        experimentId: experiment.id,
        strategyVersionId: experiment.versions?.[0]?.id || null,
        name: experiment.name,
        version: experiment.versions?.[0]?.version || null,
        routedSectors,
        routedRegimes,
        readinessScore: round(experiment.settingsJson?.deploymentReadiness?.score ?? robustnessScore),
        validationScore: round(validationScore),
        robustnessScore: round(robustnessScore),
        evidenceCount,
        assignedCapitalPct: round(savedAllocation?.assignedCapitalPct || 0),
        maxAllocationPct: round(savedAllocation?.maxAllocationPct || DEFAULT_GUARDRAILS.maxStrategyAllocationPct),
        expectedReturn: round(latestRun.returnPct),
        expectedDrawdown: round(latestRun.maxDrawdown),
        sharpe: round(latestRun.sharpe),
        volatility: round(latestRun.volatility),
        tradeCount: toNumber(latestRun.tradeCount, 0) || 0,
        latestWalkForwardStability: round(walkForwardStability),
        hasValidatedEvidence,
        walkForwardPassed: walkForwardStability >= DEFAULT_GUARDRAILS.minimumWalkForwardStability && outOfRegimePass !== false,
        robustnessPassed: robustnessScore >= DEFAULT_GUARDRAILS.minimumRobustness,
        tradeCountPassed: (toNumber(latestRun.tradeCount, 0) || 0) >= DEFAULT_GUARDRAILS.minimumTrades,
        validationScorePassed: validationScore >= DEFAULT_GUARDRAILS.minimumValidationScore,
        status: savedAllocation?.status || (hasValidatedEvidence ? "READY" : "BLOCKED"),
        method: normalizeMethod(savedAllocation?.method || allocationMethod),
      };
    });

    const suggestedWeights = buildAllocationWeights(
      strategies,
      allocationMethod,
      Object.fromEntries(
        strategies.map((strategy) => [strategy.experimentId, strategy.assignedCapitalPct || 0])
      )
    );

    return strategies.map((strategy) => {
      const assignedCapitalPct =
        strategy.method === "MANUAL_WEIGHT"
          ? strategy.assignedCapitalPct
          : round(
              toNumber(strategy.assignedCapitalPct, 0) > 0
                ? strategy.assignedCapitalPct
                : suggestedWeights[strategy.experimentId] || 0
            );
      const nextStrategy = {
        ...strategy,
        assignedCapitalPct,
      };
      return {
        ...nextStrategy,
        status: buildGuardrailViolations(nextStrategy, DEFAULT_GUARDRAILS).length ? "BLOCKED" : "READY",
      };
    });
  }

  function buildMatrixCells({ deploymentSet, lifecycleByExperimentId, strategies, activeStrategy }) {
    const activeMatrix =
      activeStrategy?.strategyJson?.executable?.allocationMatrix ||
      activeStrategy?.settings?.strategyJson?.executable?.allocationMatrix ||
      {};
    const ownerLifecycle = lifecycleByExperimentId.get(activeStrategy?.experimentId) || {};
    const routes = deploymentSet?.routes?.length
      ? deploymentSet.routes
      : Object.entries(activeMatrix).map(([key, value]) => {
          const [sector, regime] = key.split("::");
          return {
            sector,
            regime,
            selectedExperimentId: value?.experimentId || null,
            selectedStrategyVersionId: value?.strategyVersionId || null,
            allocationPct: value?.allocationPct || null,
            status: value?.status || (value?.active === false ? "PENDING" : "ACTIVE"),
          };
        });
    const strategyByExperimentId = new Map(
      strategies.map((strategy) => [strategy.experimentId, strategy])
    );
    const routeCountByExperimentId = routes.reduce((acc, route) => {
      if (!route.selectedExperimentId) {
        return acc;
      }
      acc[route.selectedExperimentId] = (acc[route.selectedExperimentId] || 0) + 1;
      return acc;
    }, {});

    if (routes.length) {
      return routes.map((route) => {
        const strategy = strategyByExperimentId.get(route.selectedExperimentId) || null;
        const status = route.status || getRouteStatus(route, strategy);
        const spreadCount = Math.max(routeCountByExperimentId[route.selectedExperimentId] || 1, 1);
        return {
          key: normalizeMatrixKey(route.sector, route.regime),
          sector: route.sector,
          regime: route.regime,
          selectedExperimentId: route.selectedExperimentId || null,
          selectedStrategyVersionId:
            route.selectedStrategyVersionId || strategy?.strategyVersionId || null,
          strategyName: strategy?.name || null,
          allocationPct:
            round(route.allocationPct) ||
            (strategy && status !== "SIT_OUT"
              ? round((toNumber(strategy.assignedCapitalPct, 0) || 0) / spreadCount)
              : 0),
          status,
          evidenceStatus:
            strategy?.hasValidatedEvidence
              ? "Validated"
              : route.selectedExperimentId
                ? "Pending evidence"
                : "Sit out",
        };
      });
    }

    return buildStrategyMatrixFromRoutes(
      ownerLifecycle.allocationMatrixEvidence?.cells || [],
      ownerLifecycle.envelope || {},
      activeMatrix
    ).cells.map((cell) => ({
      key: cell.key,
      sector: cell.sector,
      regime: cell.regime,
      selectedExperimentId: cell.experimentId || null,
      selectedStrategyVersionId: cell.strategyVersionId || null,
      strategyName: cell.strategyName || null,
      allocationPct: round(cell.allocationPct || 0),
      status: cell.status || "SIT_OUT",
      evidenceStatus: cell.active ? "Validated" : "Pending evidence",
    }));
  }

  async function getDeploymentAllocationDashboard({ userId }) {
    const { activeStrategy, dashboard, deploymentSet, experiments, lifecycleByExperimentId } =
      await loadStrategyUniverse(userId);
    const allocationMethod = normalizeMethod(
      deploymentSet?.allocationMethod || "EQUAL_WEIGHT"
    );
    const guardrails = mergeGuardrails(deploymentSet?.guardrailsJson);
    const strategies = buildStrategyCards({
      allocationMethod,
      deploymentSet,
      experiments,
      lifecycleByExperimentId,
    });
    const matrixCells = buildMatrixCells({
      allocationMethod,
      deploymentSet,
      lifecycleByExperimentId,
      strategies,
      activeStrategy,
    });
    const validation = validateAllocationPlan({
      strategies,
      matrixCells,
      guardrails,
    });
    const simulation = buildAllocationSimulation({ strategies, matrixCells });
    const previousSnapshotAllocations = deploymentSet?.snapshots?.[0]?.allocationsJson?.strategies || [];
    const rebalance = {
      frequency: deploymentSet?.rebalanceFrequency || "WEEKLY",
      maxDriftPct: round(deploymentSet?.maxDriftPct ?? 5),
      suggestions: buildRebalanceSuggestions(
        previousSnapshotAllocations,
        strategies,
        round(deploymentSet?.maxDriftPct ?? 5)
      ),
    };
    const routedStrategies = strategies.filter((strategy) =>
      matrixCells.some((cell) => cell.selectedExperimentId === strategy.experimentId)
    );

    return {
      generatedAt: new Date().toISOString(),
      deploymentSetId: deploymentSet?.id || null,
      allocationMethod,
      guardrails: {
        config: guardrails,
        valid: validation.valid,
        violations: validation.errors,
      },
      activeSet: {
        owner: activeStrategy?.experimentId
          ? {
              experimentId: activeStrategy.experimentId,
              strategyVersionId: activeStrategy.strategyVersionId || null,
              version: activeStrategy.version || null,
              name: activeStrategy.name || "Active Deployment Set",
            }
          : null,
        routedStrategies: routedStrategies.map((strategy) => ({
          experimentId: strategy.experimentId,
          name: strategy.name,
          version: strategy.version,
          routedSectors: strategy.routedSectors,
          routedRegimes: strategy.routedRegimes,
        })),
        pendingEvidence: matrixCells.filter((cell) => cell.status === "PENDING").map((cell) => cell.key),
        sitOutContexts: matrixCells.filter((cell) => cell.status === "SIT_OUT").map((cell) => cell.key),
        activeStrategyVersions: routedStrategies.map((strategy) => ({
          experimentId: strategy.experimentId,
          name: strategy.name,
          version: strategy.version,
        })),
      },
      strategies,
      matrix: {
        sectors: [...new Set(matrixCells.map((cell) => cell.sector))],
        regimes: [...new Set(matrixCells.map((cell) => cell.regime))],
        cells: matrixCells,
      },
      simulation,
      rebalance,
      auditLogs: (deploymentSet?.auditLogs || []).map(mapAuditLog),
    };
  }

  async function updateDeploymentAllocation({ actorUserId, body = {}, userId }) {
    const { activeStrategy, deploymentSet, experiments, lifecycleByExperimentId } =
      await loadStrategyUniverse(userId);
    const requestedMethod = normalizeMethod(body.allocationMethod || deploymentSet?.allocationMethod);
    const requestedGuardrails = mergeGuardrails(body.guardrails || deploymentSet?.guardrailsJson);
    const guardrailErrors = validateGuardrailConfig(requestedGuardrails);
    if (guardrailErrors.length) {
      const error = new Error(guardrailErrors[0]);
      error.statusCode = 400;
      error.details = guardrailErrors;
      throw error;
    }
    const strategyCards = buildStrategyCards({
      allocationMethod: requestedMethod,
      deploymentSet,
      experiments,
      lifecycleByExperimentId,
    });
    const requestedStrategies = Array.isArray(body.strategies) ? body.strategies : [];
    const requestedMatrix = Array.isArray(body.matrix?.cells) ? body.matrix.cells : [];

    const nextStrategies = strategyCards.map((strategy) => {
      const requested = requestedStrategies.find((entry) => entry.experimentId === strategy.experimentId);
      return {
        ...strategy,
        assignedCapitalPct: round(
          requested
            ? requested.assignedCapitalPct
            : strategy.assignedCapitalPct
        ) || 0,
        maxAllocationPct: round(
          requested
            ? requested.maxAllocationPct
            : strategy.maxAllocationPct
        ) || strategy.maxAllocationPct,
      };
    });

    const manualWeights = Object.fromEntries(
      nextStrategies.map((strategy) => [strategy.experimentId, strategy.assignedCapitalPct || 0])
    );
    const calculatedWeights = buildAllocationWeights(nextStrategies, requestedMethod, manualWeights);
    const finalStrategies = nextStrategies.map((strategy) => {
      const assignedCapitalPct =
        requestedMethod === "MANUAL_WEIGHT"
          ? strategy.assignedCapitalPct
          : calculatedWeights[strategy.experimentId] || 0;
      const nextStrategy = {
        ...strategy,
        assignedCapitalPct: round(assignedCapitalPct) || 0,
      };
      return {
        ...nextStrategy,
        status: buildGuardrailViolations(nextStrategy, requestedGuardrails).length ? "BLOCKED" : "READY",
      };
    });
    const strategyByExperimentId = new Map(
      finalStrategies.map((strategy) => [strategy.experimentId, strategy])
    );

    const defaultMatrix = buildMatrixCells({
      deploymentSet,
      lifecycleByExperimentId,
      strategies: finalStrategies,
      activeStrategy,
    });
    const nextMatrixCells = (requestedMatrix.length ? requestedMatrix : defaultMatrix).map((cell) => {
      const strategy = strategyByExperimentId.get(cell.selectedExperimentId) || null;
      return {
        key: cell.key || normalizeMatrixKey(cell.sector, cell.regime),
        sector: cell.sector,
        regime: cell.regime,
        selectedExperimentId: cell.selectedExperimentId || null,
        selectedStrategyVersionId:
          cell.selectedStrategyVersionId || strategy?.strategyVersionId || null,
        allocationPct: round(cell.allocationPct || 0) || 0,
        status: cell.status || getRouteStatus(cell, strategy),
      };
    });

    const unknownStrategyReference = nextMatrixCells.find(
      (cell) => cell.selectedExperimentId && !strategyByExperimentId.has(cell.selectedExperimentId)
    );
    if (unknownStrategyReference) {
      const error = new Error("Allocation plan references a strategy that does not belong to this user.");
      error.statusCode = 403;
      throw error;
    }

    const mismatchedVersionReference = nextMatrixCells.find((cell) => {
      if (!cell.selectedExperimentId || !cell.selectedStrategyVersionId) {
        return false;
      }
      const strategy = strategyByExperimentId.get(cell.selectedExperimentId);
      return strategy && strategy.strategyVersionId && strategy.strategyVersionId !== cell.selectedStrategyVersionId;
    });
    if (mismatchedVersionReference) {
      const error = new Error("Allocation plan references a stale or invalid strategy version.");
      error.statusCode = 400;
      throw error;
    }

    const validation = validateAllocationPlan({
      strategies: finalStrategies,
      matrixCells: nextMatrixCells,
      guardrails: requestedGuardrails,
    });
    if (!validation.valid) {
      const error = new Error(validation.errors[0] || "Allocation plan is invalid.");
      error.statusCode = 400;
      error.details = validation.errors;
      throw error;
    }

    const simulation = buildAllocationSimulation({
      strategies: finalStrategies,
      matrixCells: nextMatrixCells,
    });
    const rebalance = {
      frequency: String(body.rebalance?.frequency || deploymentSet?.rebalanceFrequency || "WEEKLY").toUpperCase(),
      maxDriftPct: round(body.rebalance?.maxDriftPct ?? deploymentSet?.maxDriftPct ?? 5) || 5,
      suggestions: buildRebalanceSuggestions(
        deploymentSet?.capitalAllocations || [],
        finalStrategies,
        round(body.rebalance?.maxDriftPct ?? deploymentSet?.maxDriftPct ?? 5) || 5
      ),
    };

    const auditEntries = buildAllocationAuditEntries({
      actorUserId,
      deploymentSetId: deploymentSet?.id || "pending-deployment-set",
      previousAllocations: deploymentSet?.capitalAllocations || [],
      nextAllocations: finalStrategies,
      reasonNote: body.reasonNote || "",
      userId,
    });

    const activeAllocationMatrix = Object.fromEntries(
      nextMatrixCells.map((cell) => [
        normalizeMatrixKey(cell.sector, cell.regime),
        cell.status === "SIT_OUT"
          ? {
              active: false,
              status: "SIT_OUT",
              allocationPct: 0,
            }
          : {
              experimentId: cell.selectedExperimentId,
              strategyVersionId: cell.selectedStrategyVersionId,
              strategyName: strategyByExperimentId.get(cell.selectedExperimentId)?.name || null,
              allocationPct: round(cell.allocationPct) || 0,
              status: cell.status,
              active: cell.status === "ACTIVE",
            },
      ])
    );

    const transactionResult = await prisma.run((db) =>
      db.$transaction(async (transaction) => {
        const nextSet = await transaction.strategyDeploymentSet.upsert({
          where: { userId },
          update: {
            allocationMethod: requestedMethod,
            rebalanceFrequency: rebalance.frequency,
            maxDriftPct: rebalance.maxDriftPct,
            guardrailsJson: requestedGuardrails,
            ownerExperimentId: activeStrategy?.experimentId || null,
            ownerStrategyVersionId: activeStrategy?.strategyVersionId || null,
          },
          create: {
            userId,
            allocationMethod: requestedMethod,
            rebalanceFrequency: rebalance.frequency,
            maxDriftPct: rebalance.maxDriftPct,
            guardrailsJson: requestedGuardrails,
            ownerExperimentId: activeStrategy?.experimentId || null,
            ownerStrategyVersionId: activeStrategy?.strategyVersionId || null,
          },
        });

        await transaction.strategyDeploymentRoute.deleteMany({
          where: { deploymentSetId: nextSet.id, userId },
        });
        if (nextMatrixCells.length) {
          await transaction.strategyDeploymentRoute.createMany({
            data: nextMatrixCells.map((cell) => ({
              userId,
              deploymentSetId: nextSet.id,
              sector: cell.sector,
              regime: cell.regime,
              selectedExperimentId: cell.selectedExperimentId,
              selectedStrategyVersionId: cell.selectedStrategyVersionId,
              allocationPct: cell.allocationPct,
              status: cell.status,
              evidenceStatus:
                cell.status === "ACTIVE"
                  ? "Validated"
                  : cell.status === "PENDING"
                    ? "Pending evidence"
                    : "Sit out",
            })),
          });
        }

        await transaction.strategyCapitalAllocation.deleteMany({
          where: { deploymentSetId: nextSet.id, userId },
        });
        if (finalStrategies.length) {
          await transaction.strategyCapitalAllocation.createMany({
            data: finalStrategies.map((strategy) => ({
              userId,
              deploymentSetId: nextSet.id,
              experimentId: strategy.experimentId,
              strategyVersionId: strategy.strategyVersionId,
              method: requestedMethod,
              assignedCapitalPct: strategy.assignedCapitalPct,
              maxAllocationPct: strategy.maxAllocationPct,
              status: strategy.status,
            })),
          });
        }

        await transaction.strategyAllocationSnapshot.create({
          data: {
            userId,
            deploymentSetId: nextSet.id,
            allocationMethod: requestedMethod,
            allocationsJson: { strategies: finalStrategies },
            matrixJson: { cells: nextMatrixCells },
            simulationJson: simulation,
            guardrailsJson: requestedGuardrails,
            rebalanceJson: rebalance,
            reasonNote: body.reasonNote || null,
          },
        });

        if (auditEntries.length) {
          await transaction.strategyAllocationAuditLog.createMany({
            data: auditEntries.map((entry) => ({
              ...entry,
              deploymentSetId: nextSet.id,
            })),
          });
        }

        let nextActiveStrategyConfig = null;
        if (activeStrategy?.experimentId) {
          const ownerExperimentRecord = await transaction.strategyExperiment.findFirst({
            where: {
              id: activeStrategy.experimentId,
              userId,
            },
          });
          const ownerExperiment = strategyStorage.hydrateStrategyExperimentRecord(ownerExperimentRecord);

          if (ownerExperiment) {
            const nextSettings = mergeAllocationMatrixIntoSettings(
              ownerExperiment.settingsJson || {},
              activeAllocationMatrix
            );
            const encryptedOwner = strategyStorage.encryptExperimentForStorage({
              id: ownerExperiment.id,
              userId,
              name: ownerExperiment.name,
              description: ownerExperiment.description,
              status:
                ownerExperiment.status === "ACTIVE"
                  ? "ACTIVE"
                  : ownerExperiment.status,
              settingsJson: nextSettings,
            });
            await transaction.strategyExperiment.updateMany({
              where: { id: ownerExperiment.id, userId },
              data: {
                settingsJson: encryptedOwner.settingsJson,
                encryptedStrategy: encryptedOwner.encryptedStrategy,
                encryptedStrategyKey: encryptedOwner.encryptedStrategyKey,
                strategyEncryptionIv: encryptedOwner.strategyEncryptionIv,
                strategyEncryptionTag: encryptedOwner.strategyEncryptionTag,
                strategyEncryptionKeyIv: encryptedOwner.strategyEncryptionKeyIv,
                strategyEncryptionKeyTag: encryptedOwner.strategyEncryptionKeyTag,
                strategyEncryptionAlgorithmVersion:
                  encryptedOwner.strategyEncryptionAlgorithmVersion,
                status: encryptedOwner.status,
              },
            });

            const updatedOwnerRecord = await transaction.strategyExperiment.findFirst({
              where: { id: ownerExperiment.id, userId },
            });
            const updatedOwner = strategyStorage.hydrateStrategyExperimentRecord(updatedOwnerRecord);

            const nextVersion = await createStrategyVersion(
              transaction,
              userId,
              updatedOwner,
              "Updated deployment allocation plan"
            );

            await transaction.strategyVersion.updateMany({
              where: { userId, deploymentStatus: "ACTIVE" },
              data: { deploymentStatus: "CANDIDATE" },
            });
            await transaction.strategyVersion.updateMany({
              where: { id: nextVersion.id, userId },
              data: { deploymentStatus: "ACTIVE", activatedAt: new Date() },
            });
            await upsertCanonicalDeploymentRecord(transaction, {
              userId,
              actorUserId,
              ownerExperimentId: ownerExperiment.id,
              ownerStrategyVersionId: nextVersion.id,
              runtimeConfiguration: {
                experimentId: ownerExperiment.id,
                strategyVersionId: nextVersion.id,
                allocationMatrix: activeAllocationMatrix,
              },
              reasonNote:
                body.reasonNote || "Updated deployment allocation plan",
              action: "DEPLOYMENT_ALLOCATION_SYNC",
            });

            nextActiveStrategyConfig = {
              ...activeStrategy,
              strategyVersionId: nextVersion.id,
              version: nextVersion.version,
              settings: nextSettings,
              strategyJson: nextVersion.strategyJson || nextSettings.strategyJson || null,
            };
          }
        }

        return {
          nextActiveStrategyConfig,
          nextSet,
        };
      })
    );

    if (transactionResult?.nextActiveStrategyConfig) {
      await writeActiveStrategyConfig(userId, transactionResult.nextActiveStrategyConfig);
    }

    return getDeploymentAllocationDashboard({
      userId,
      deploymentSetId: transactionResult?.nextSet?.id,
    });
  }

  return {
    buildAllocationAuditEntries,
    buildAllocationSimulation,
    buildAllocationWeights,
    getDeploymentAllocationDashboard,
    updateDeploymentAllocation,
    validateAllocationPlan,
  };
}

module.exports = {
  DEFAULT_GUARDRAILS,
  buildAllocationAuditEntries,
  buildAllocationSimulation,
  buildAllocationWeights,
  createStrategyAllocationService,
  validateAllocationPlan,
};
