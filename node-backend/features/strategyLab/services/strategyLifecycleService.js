const DEFAULT_ACTIVATION_RULES = {
  minimumTrades: 30,
  minimumRobustness: 60,
  minimumWalkForwardStability: 55,
  validationConfidenceThreshold: 55,
  perRegimeMinimumTrades: 10,
  perRegimeMinimumHitRate: 45,
  requireOutOfRegimePass: true,
};

const {
  buildAllocationMatrixEvidence,
} = require("./strategyConditioningService");
const {
  getDefaultStrategyStorageService,
} = require("./strategyStorage.service");

let validationSignalLifecycleSupport = null;
const strategyStorage = getDefaultStrategyStorageService();

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  const numericValues = values
    .map(numberOrNull)
    .filter((value) => value !== null);

  if (!numericValues.length) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function round(value, digits = 2) {
  const numeric = numberOrNull(value);
  return numeric === null ? null : Number(numeric.toFixed(digits));
}

function mergeActivationRules(rules = {}) {
  return {
    ...DEFAULT_ACTIVATION_RULES,
    ...Object.fromEntries(
      Object.entries(rules || {}).filter(([, value]) => value !== undefined && value !== null)
    ),
  };
}

function getLatestVersion(versions = []) {
  return [...versions].sort((left, right) => Number(right.version || 0) - Number(left.version || 0))[0] || null;
}

function getRuleSnapshot(strategyJson = {}, settings = {}) {
  return {
    executable: strategyJson.executable || null,
    filters: strategyJson.executable?.filters || null,
    entryRules: strategyJson.executable?.entryRules || [],
    exitRules: strategyJson.executable?.exitRules || [],
    riskRules: strategyJson.executable?.riskRules || {},
    parameters: {
      emaFast: settings.emaFast,
      emaSlow: settings.emaSlow,
      rsiThreshold: settings.rsiThreshold,
      atrStopMultiple: settings.atrStopMultiple,
      atrTakeProfitMultiple: settings.atrTakeProfitMultiple,
      signalThreshold: settings.signalThreshold,
    },
  };
}

async function getLatestVersionForExperiment(db, userId, experimentId) {
  const record = await db.strategyVersion.findFirst({
    where: { userId, experimentId },
    orderBy: { version: "desc" },
  });
  return strategyStorage.hydrateStrategyVersionRecord(record);
}

async function getValidationSignalLifecycleSupport(prisma) {
  if (validationSignalLifecycleSupport) {
    return validationSignalLifecycleSupport;
  }

  try {
    const columns = await prisma.run((db) => db.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'ValidationSignal'
        AND column_name IN ('marketRegime', 'regimeAtSignal', 'sectorContext')
    `);
    const names = new Set(columns.map((column) => column.column_name));
    validationSignalLifecycleSupport = {
      hasMarketRegime: names.has("marketRegime"),
      hasRegimeAtSignal: names.has("regimeAtSignal"),
      hasSectorContext: names.has("sectorContext"),
    };
  } catch (_error) {
    validationSignalLifecycleSupport = {
      hasMarketRegime: true,
      hasRegimeAtSignal: true,
      hasSectorContext: true,
    };
  }

  return validationSignalLifecycleSupport;
}

async function getStrategyValidationAggregate(prisma, userId, { strategyVersionId, strategyId } = {}) {
  const where = {
    userId,
    evaluationStatus: "MATURED",
    actualReturn: { not: null },
  };

  if (strategyVersionId) {
    where.strategyVersionId = strategyVersionId;
  } else if (strategyId) {
    where.strategyId = strategyId;
  } else {
    return {
      sampleCount: 0,
      hitRate: null,
      realizedReturn: null,
      drawdown: null,
      expectancy: null,
      averageConfidence: null,
      evidenceLevel: "LOW",
    };
  }

  const support = await getValidationSignalLifecycleSupport(prisma);
  const select = {
    actualReturn: true,
    drawdown: true,
    maxDrawdown: true,
    winLoss: true,
    confidence: true,
  };

  if (support.hasMarketRegime) {
    select.marketRegime = true;
  }
  if (support.hasRegimeAtSignal) {
    select.regimeAtSignal = true;
  }
  if (support.hasSectorContext) {
    select.sectorContext = true;
  }

  const signals = await prisma.run((db) =>
    db.validationSignal.findMany({
      where,
      select,
    })
  );

  const sampleCount = signals.length;
  const wins = signals.filter(
    (signal) => signal.winLoss === "WIN" || Number(signal.actualReturn) > 0
  ).length;
  const returns = signals.map((signal) => signal.actualReturn);
  const drawdowns = signals.map((signal) => signal.drawdown ?? signal.maxDrawdown);
  const confidence = signals.map((signal) => signal.confidence);
  const byRegime = Object.values(
    signals.reduce((acc, signal) => {
      const regime = signal.regimeAtSignal || signal.marketRegime || "UNKNOWN";
      const bucket = acc[regime] || {
        regime,
        sampleCount: 0,
        wins: 0,
        returns: [],
      };
      bucket.sampleCount += 1;
      if (signal.winLoss === "WIN" || Number(signal.actualReturn) > 0) {
        bucket.wins += 1;
      }
      bucket.returns.push(signal.actualReturn);
      acc[regime] = bucket;
      return acc;
    }, {})
  ).map((bucket) => ({
    regime: bucket.regime,
    sampleCount: bucket.sampleCount,
    hitRate: round((bucket.wins / Math.max(bucket.sampleCount, 1)) * 100),
    realizedReturn: round(average(bucket.returns)),
  }));

  const bySectorRegime = Object.values(
    signals.reduce((acc, signal) => {
      const sector = signal.sectorContext || "UNKNOWN";
      const regime = signal.regimeAtSignal || signal.marketRegime || "UNKNOWN";
      const key = `${sector}::${regime}`;
      const bucket = acc[key] || {
        sector,
        regime,
        sampleCount: 0,
        wins: 0,
        returns: [],
      };
      bucket.sampleCount += 1;
      if (signal.winLoss === "WIN" || Number(signal.actualReturn) > 0) {
        bucket.wins += 1;
      }
      bucket.returns.push(signal.actualReturn);
      acc[key] = bucket;
      return acc;
    }, {})
  ).map((bucket) => ({
    sector: bucket.sector,
    regime: bucket.regime,
    sampleCount: bucket.sampleCount,
    hitRate: round((bucket.wins / Math.max(bucket.sampleCount, 1)) * 100),
    realizedReturn: round(average(bucket.returns)),
  }));

  return {
    sampleCount,
    hitRate: sampleCount ? round((wins / sampleCount) * 100) : null,
    realizedReturn: round(average(returns)),
    drawdown: round(average(drawdowns)),
    expectancy: round(average(returns)),
    averageConfidence: round(average(confidence)),
    evidenceLevel: sampleCount >= 100 ? "HIGH" : sampleCount >= 30 ? "MEDIUM" : "LOW",
    byRegime,
    bySectorRegime,
  };
}

async function getStrategyLifecycleEvidence(prisma, userId, experiment, { targetVersionId = null } = {}) {
  const [latestRun, latestWalkForward, latestVersion] = await prisma.run((db) =>
    Promise.all([
      db.strategyRun.findFirst({
        where: { userId, experimentId: experiment.id },
        orderBy: { createdAt: "desc" },
      }),
      db.walkForwardRun.findFirst({
        where: { userId, experimentId: experiment.id },
        orderBy: { createdAt: "desc" },
      }),
      getLatestVersionForExperiment(db, userId, experiment.id),
    ])
  );
  const targetVersion =
    (targetVersionId &&
      experiment.versions?.find((version) => version.id === targetVersionId)) ||
    latestVersion;
  const validation = await getStrategyValidationAggregate(prisma, userId, {
    strategyVersionId: targetVersion?.id,
    strategyId: experiment.id,
  });

  return {
    latestRun,
    latestWalkForward,
    latestVersion,
    targetVersion,
    validation,
    activationRules: mergeActivationRules(experiment.settingsJson?.activationRules),
  };
}

function computeLifecycleReadiness({
  computeDeploymentReadiness,
  latestRun,
  robustness,
  latestWalkForward,
  validation,
  validationWarnings = [],
  activationRules = DEFAULT_ACTIVATION_RULES,
} = {}) {
  const rules = mergeActivationRules(activationRules);
  const base = computeDeploymentReadiness({
    latestRun,
    robustness,
    walkForward: latestWalkForward,
    validation,
    validationWarnings,
    activationRules: rules,
  });
  const tradeCount = numberOrNull(latestRun?.tradeCount) || 0;
  const robustnessScore = numberOrNull(robustness?.score) ?? 0;
  const walkForwardStability = numberOrNull(latestWalkForward?.stabilityScore) ?? 0;
  const validationConfidence = numberOrNull(validation?.hitRate ?? validation?.averageConfidence) ?? 0;
  const byRegime = Array.isArray(validation?.byRegime) ? validation.byRegime : [];
  const outOfRegimeStability = latestWalkForward?.summaryJson?.outOfRegimeStability || null;
  const perRegimeFailures = byRegime
    .filter(
      (row) =>
        row.sampleCount < rules.perRegimeMinimumTrades ||
        (numberOrNull(row.hitRate) ?? 0) < rules.perRegimeMinimumHitRate
    )
    .map((row) => ({
      regime: row.regime,
      sampleCount: row.sampleCount,
      hitRate: round(row.hitRate),
    }));
  const gateFailures = [
    tradeCount < rules.minimumTrades
      ? `Minimum trades not met (${tradeCount}/${rules.minimumTrades}).`
      : null,
    robustnessScore < rules.minimumRobustness
      ? `Minimum robustness not met (${round(robustnessScore)}/${rules.minimumRobustness}).`
      : null,
    walkForwardStability < rules.minimumWalkForwardStability
      ? `Walk-forward stability not met (${round(walkForwardStability)}/${rules.minimumWalkForwardStability}).`
      : null,
    validationConfidence < rules.validationConfidenceThreshold
      ? `Validation confidence threshold not met (${round(validationConfidence)}/${rules.validationConfidenceThreshold}).`
      : null,
    perRegimeFailures.length
      ? `Per-regime evidence is insufficient for: ${perRegimeFailures
          .map((row) => `${row.regime} (${row.sampleCount} trades, ${row.hitRate ?? 0}% hit rate)`)
          .join(", ")}.`
      : null,
    rules.requireOutOfRegimePass && outOfRegimeStability?.pass === false
      ? `Out-of-regime walk-forward failed (${outOfRegimeStability.outOfRegimeReturn ?? "n/a"} return, ${outOfRegimeStability.returnDecayPct ?? "n/a"}% decay).`
      : null,
    rules.requireOutOfRegimePass && outOfRegimeStability === null
      ? "Out-of-regime walk-forward evidence is missing."
      : null,
  ].filter(Boolean);
  const canActivate = base.canActivate && gateFailures.length === 0;

  return {
    ...base,
    canActivate,
    activationRules: rules,
    gates: {
      minimumTrades: {
        required: rules.minimumTrades,
        actual: tradeCount,
        pass: tradeCount >= rules.minimumTrades,
      },
      minimumRobustness: {
        required: rules.minimumRobustness,
        actual: round(robustnessScore),
        pass: robustnessScore >= rules.minimumRobustness,
      },
      minimumWalkForwardStability: {
        required: rules.minimumWalkForwardStability,
        actual: round(walkForwardStability),
        pass: walkForwardStability >= rules.minimumWalkForwardStability,
      },
      validationConfidenceThreshold: {
        required: rules.validationConfidenceThreshold,
        actual: round(validationConfidence),
        pass: validationConfidence >= rules.validationConfidenceThreshold,
      },
      perRegimeEvidence: {
        requiredTrades: rules.perRegimeMinimumTrades,
        requiredHitRate: rules.perRegimeMinimumHitRate,
        pass: perRegimeFailures.length === 0,
        failingRegimes: perRegimeFailures,
      },
      outOfRegimeWalkForward: {
        required: rules.requireOutOfRegimePass,
        actual: outOfRegimeStability,
        pass: rules.requireOutOfRegimePass ? outOfRegimeStability?.pass === true : true,
      },
    },
    reasons: [...new Set([...(base.reasons || []), ...gateFailures])],
  };
}

function statusFromReadiness(readiness) {
  if (readiness.canActivate) return "CANDIDATE";
  if (readiness.score >= 50) return "RESEARCH";
  return "DRAFT";
}

function normalizeMatrixKey(sector, regime) {
  return `${String(sector || "UNKNOWN").trim()}::${String(regime || "UNKNOWN").trim()}`;
}

function getAllocationMatrixFromExperiment(experiment, version = null) {
  return (
    version?.strategyJson?.executable?.allocationMatrix ||
    experiment?.settingsJson?.strategyJson?.executable?.allocationMatrix ||
    experiment?.settingsJson?.allocationMatrix ||
    {}
  );
}

function mergeAllocationMatrixIntoSettings(settings = {}, allocationMatrix = {}) {
  const nextSettings = {
    ...settings,
    allocationMatrix,
  };
  const currentStrategyJson = settings.strategyJson || {};
  nextSettings.strategyJson = {
    ...currentStrategyJson,
    executable: {
      ...(currentStrategyJson.executable || {}),
      allocationMatrix,
    },
  };
  return nextSettings;
}

function buildMembershipSummary(cells = []) {
  const byExperiment = new Map();

  for (const cell of cells) {
    if (!cell?.experimentId) {
      continue;
    }

    const entry = byExperiment.get(cell.experimentId) || {
      experimentId: cell.experimentId,
      strategyVersionId: cell.strategyVersionId || null,
      strategyName: cell.strategyName || "Unassigned strategy",
      activeContexts: 0,
      pendingContexts: 0,
      totalContexts: 0,
    };

    entry.totalContexts += 1;
    if (cell.active) {
      entry.activeContexts += 1;
    } else if (cell.configured) {
      entry.pendingContexts += 1;
    }

    byExperiment.set(cell.experimentId, entry);
  }

  return [...byExperiment.values()];
}

async function getLatestExperimentVersion(db, userId, experimentId) {
  const record = await db.strategyVersion.findFirst({
    where: { userId, experimentId },
    orderBy: { version: "desc" },
  });
  return strategyStorage.hydrateStrategyVersionRecord(record);
}

async function getActiveDeploymentVersions(db, userId) {
  const records = await db.strategyVersion.findMany({
    where: { userId, deploymentStatus: "ACTIVE" },
    orderBy: [{ activatedAt: "desc" }, { version: "desc" }],
    include: {
      experiment: true,
    },
  });
  return records.map((record) => strategyStorage.hydrateStrategyVersionRecord(record));
}

async function upsertCanonicalDeploymentRecord(transaction, {
  userId,
  ownerExperimentId = null,
  ownerStrategyVersionId = null,
  reasonNote = null,
  readiness = null,
  runtimeConfiguration = null,
  actorUserId = userId,
  action = null,
}) {
  const previousSet = await (transaction.strategyDeploymentSet?.findUnique
    ? transaction.strategyDeploymentSet.findUnique({
        where: { userId },
      })
    : Promise.resolve(null));
  const nextSet = await transaction.strategyDeploymentSet.upsert({
    where: { userId },
    update: {
      ownerExperimentId,
      ownerStrategyVersionId,
    },
    create: {
      userId,
      ownerExperimentId,
      ownerStrategyVersionId,
    },
  });

  await transaction.strategyAllocationSnapshot.create({
    data: {
      userId,
      deploymentSetId: nextSet.id,
      allocationMethod: nextSet.allocationMethod || "EQUAL_WEIGHT",
      allocationsJson: {
        ownerExperimentId,
        ownerStrategyVersionId,
      },
      matrixJson: {
        runtimeConfiguration: runtimeConfiguration || null,
      },
      simulationJson: {
        readiness: readiness || null,
      },
      guardrailsJson: nextSet.guardrailsJson || null,
      rebalanceJson: {
        event: ownerStrategyVersionId ? "DEPLOYMENT_SYNC" : "DEPLOYMENT_DEACTIVATED",
      },
      reasonNote: reasonNote || null,
    },
  });

  const ownerChanged =
    previousSet?.ownerExperimentId !== ownerExperimentId ||
    previousSet?.ownerStrategyVersionId !== ownerStrategyVersionId;
  if (ownerChanged && transaction.strategyAllocationAuditLog?.create) {
    await transaction.strategyAllocationAuditLog.create({
      data: {
        userId,
        deploymentSetId: nextSet.id,
        actorUserId,
        experimentId: ownerExperimentId,
        action: action || (ownerStrategyVersionId ? "DEPLOYMENT_SYNC" : "DEPLOYMENT_DEACTIVATED"),
        previousAllocation: previousSet
          ? {
              ownerExperimentId: previousSet.ownerExperimentId || null,
              ownerStrategyVersionId: previousSet.ownerStrategyVersionId || null,
            }
          : null,
        newAllocation: {
          ownerExperimentId,
          ownerStrategyVersionId,
          runtimeConfiguration: runtimeConfiguration || null,
          readiness: readiness || null,
        },
        reasonNote: reasonNote || null,
      },
    });
  }

  return nextSet;
}

function buildCanonicalDeployment({
  deploymentSet = null,
  activeStrategy = null,
  activeVersion = null,
  activeExperiment = null,
  warnings = [],
  activeVersionCount = null,
} = {}) {
  const ownerExperimentId =
    deploymentSet?.ownerExperimentId ||
    activeStrategy?.experimentId ||
    activeVersion?.experimentId ||
    null;
  const ownerStrategyVersionId =
    deploymentSet?.ownerStrategyVersionId ||
    activeStrategy?.strategyVersionId ||
    activeVersion?.id ||
    null;
  const activatedAt =
    activeVersion?.activatedAt ||
    activeStrategy?.updatedAt ||
    null;
  const runtimeConfiguration = {
    strategyVersionId: ownerStrategyVersionId,
    experimentId: ownerExperimentId,
    allocationMatrix:
      activeVersion?.strategyJson?.executable?.allocationMatrix ||
      activeStrategy?.strategyJson?.executable?.allocationMatrix ||
      activeExperiment?.settingsJson?.strategyJson?.executable?.allocationMatrix ||
      {},
    activationRules: activeStrategy?.activationRules || null,
  };

  return {
    active: Boolean(ownerExperimentId && ownerStrategyVersionId),
    deploymentSetId: deploymentSet?.id || null,
    owner: ownerExperimentId
      ? {
          experimentId: ownerExperimentId,
          strategyVersionId: ownerStrategyVersionId,
          version: activeVersion?.version || activeStrategy?.version || null,
          name: activeStrategy?.name || activeExperiment?.name || null,
          description: activeStrategy?.description ?? activeExperiment?.description ?? "",
        }
      : null,
    deploymentStatus: ownerStrategyVersionId ? "ACTIVE" : "INACTIVE",
    deployedAt: activatedAt,
    activatedAt,
    runtimeConfiguration,
    approvalState: activeStrategy?.readiness?.canActivate ? "APPROVED" : "BLOCKED",
    readiness: activeStrategy?.readiness || activeVersion?.evidenceJson?.deploymentReadiness || null,
    integrity: {
      activeVersionCount,
      warnings,
    },
  };
}

function validateAssignableContexts({
  contexts = [],
  envelope = {},
  validationBySectorRegime = [],
}) {
  if (!Array.isArray(contexts) || contexts.length === 0) {
    throw new Error("At least one sector/regime context is required.");
  }

  const allowedSectors = new Set((envelope.sectors || []).map((item) => String(item).trim()).filter(Boolean));
  const allowedRegimes = new Set((envelope.regimes || []).map((item) => String(item).trim()).filter(Boolean));
  const evidenceByKey = new Map(
    (validationBySectorRegime || []).map((row) => [
      normalizeMatrixKey(row.sector, row.regime),
      row,
    ])
  );

  return contexts.map((context) => {
    const sector = String(context?.sector || "").trim();
    const regime = String(context?.regime || "").trim();

    if (!sector || !regime) {
      throw new Error("Each context must include a sector and regime.");
    }

    if (allowedSectors.size && !allowedSectors.has(sector)) {
      throw new Error(`${sector} is outside this strategy's allowed sector envelope.`);
    }

    if (allowedRegimes.size && !allowedRegimes.has(regime)) {
      throw new Error(`${regime} is outside this strategy's allowed regime envelope.`);
    }

    const evidence = evidenceByKey.get(normalizeMatrixKey(sector, regime)) || null;

    return {
      sector,
      regime,
      evidence,
    };
  });
}

async function activateStrategyVersion({
  prisma,
  userId,
  experiment,
  version,
  readiness,
  writeActiveStrategyConfig,
}) {
  const settings = experiment.settingsJson || {};
  const strategyJson = version.strategyJson || settings.strategyJson || null;
  const ruleSnapshot = getRuleSnapshot(strategyJson || {}, settings);
  const activatedAt = new Date();

  await prisma.run((db) =>
    db.$transaction(async (transaction) => {
      await transaction.strategyVersion.updateMany({
        where: { userId, deploymentStatus: "ACTIVE" },
        data: { deploymentStatus: "CANDIDATE" },
      });
      await transaction.strategyExperiment.updateMany({
        where: { userId, status: "ACTIVE" },
        data: { status: "CANDIDATE" },
      });
      await transaction.strategyVersion.updateMany({
        where: { userId, id: version.id },
        data: {
          deploymentStatus: "ACTIVE",
          activationRulesJson: readiness.activationRules,
          evidenceJson: {
            ...(version.evidenceJson || {}),
            deploymentReadiness: readiness,
            activatedAt: activatedAt.toISOString(),
          },
          activatedAt,
        },
      });
      await transaction.strategyExperiment.updateMany({
        where: { userId, id: experiment.id },
        data: { status: "ACTIVE" },
      });
      await upsertCanonicalDeploymentRecord(transaction, {
        userId,
        ownerExperimentId: experiment.id,
        ownerStrategyVersionId: version.id,
        readiness,
        runtimeConfiguration: {
          strategyVersionId: version.id,
          experimentId: experiment.id,
          ruleSnapshot,
        },
        reasonNote: `Activated ${experiment.name} v${version.version || "?"}`,
        action: "DEPLOYMENT_ACTIVATED",
      });
    })
  );

  const nextConfig = {
    experimentId: experiment.id,
    strategyVersionId: version.id,
    version: version.version,
    name: experiment.name,
    description: experiment.description,
    settings,
    strategyJson,
    ruleSnapshot,
    readiness,
    activationRules: readiness.activationRules,
  };
  return writeActiveStrategyConfig(userId, nextConfig);
}

async function deactivateStrategyDeployment({
  prisma,
  userId,
  readActiveStrategyConfig,
  writeActiveStrategyConfig,
  reasonNote = "Deactivated active deployment",
}) {
  const activeStrategy = await readActiveStrategyConfig(userId);

  await prisma.run((db) =>
    db.$transaction(async (transaction) => {
      await transaction.strategyVersion.updateMany({
        where: { userId, deploymentStatus: "ACTIVE" },
        data: { deploymentStatus: "CANDIDATE" },
      });
      await transaction.strategyExperiment.updateMany({
        where: { userId, status: "ACTIVE" },
        data: { status: "CANDIDATE" },
      });
      await upsertCanonicalDeploymentRecord(transaction, {
        userId,
        ownerExperimentId: null,
        ownerStrategyVersionId: null,
        runtimeConfiguration: null,
        readiness: null,
        reasonNote,
        action: "DEPLOYMENT_DEACTIVATED",
      });
    })
  );

  return writeActiveStrategyConfig(userId, {
    experimentId: null,
    strategyVersionId: null,
    version: null,
    name: activeStrategy?.name || "Default Strategy",
    description: activeStrategy?.description || "",
    readiness: null,
    activationRules: null,
    ruleSnapshot: null,
  });
}

async function resolveCanonicalDeploymentState({
  prisma,
  userId,
  readActiveStrategyConfig,
}) {
  const [storedActiveStrategy, deploymentRecord, activeVersions] = await Promise.all([
    readActiveStrategyConfig(userId),
    prisma.run((db) =>
      db.strategyDeploymentSet.findUnique({
        where: { userId },
      })
    ),
    prisma.run((db) => getActiveDeploymentVersions(db, userId)),
  ]);

  const activeVersion =
    activeVersions.find((version) => version.id === deploymentRecord?.ownerStrategyVersionId) ||
    activeVersions[0] ||
    null;
  const activeExperiment =
    activeVersion?.experiment ||
    null;
  const warnings = [];
  if (!deploymentRecord?.ownerStrategyVersionId && activeVersions.length) {
    warnings.push("Active strategy versions exist without a canonical deployment owner.");
  }
  if (deploymentRecord?.ownerStrategyVersionId && !activeVersion) {
    warnings.push("Canonical deployment owner does not resolve to an active strategy version.");
  }
  if (activeVersions.length > 1) {
    warnings.push(`Multiple ACTIVE strategy versions detected (${activeVersions.length}).`);
  }
  if (
    storedActiveStrategy?.active &&
    (storedActiveStrategy.experimentId !== deploymentRecord?.ownerExperimentId ||
      storedActiveStrategy.strategyVersionId !== deploymentRecord?.ownerStrategyVersionId)
  ) {
    warnings.push("Cached active strategy metadata diverges from the canonical deployment owner.");
  }

  return buildCanonicalDeployment({
    deploymentSet: deploymentRecord,
    activeStrategy: storedActiveStrategy,
    activeVersion,
    activeExperiment,
    warnings,
    activeVersionCount: activeVersions.length,
  });
}

async function getActiveSetState({
  prisma,
  userId,
  readActiveStrategyConfig,
}) {
  const activeStrategy = await readActiveStrategyConfig(userId);
  if (!activeStrategy?.experimentId) {
    return {
      active: false,
      owner: null,
      sectors: [],
      regimes: [],
      cells: [],
      membership: [],
      routed: 0,
      pending: 0,
      sitOut: 0,
    };
  }

  const dashboard = await getStrategyLifecycleDashboard({
    prisma,
    userId,
    experimentId: activeStrategy.experimentId,
  });
  const ownerStrategy = dashboard.strategies?.[0] || null;
  const matrix = ownerStrategy?.allocationMatrixEvidence || {
    sectors: [],
    regimes: [],
    cells: [],
  };
  const membership = buildMembershipSummary(matrix.cells);
  const total = (matrix.sectors?.length || 0) * (matrix.regimes?.length || 0);
  const routed = matrix.cells.filter((cell) => cell.active).length;
  const pending = matrix.cells.filter((cell) => cell.configured && !cell.active).length;

  return {
    active: true,
    owner: {
      experimentId: activeStrategy.experimentId,
      strategyVersionId: activeStrategy.strategyVersionId || null,
      name: activeStrategy.name || ownerStrategy?.name || "Active Deployment Set",
      version: activeStrategy.version || null,
    },
    sectors: matrix.sectors || [],
    regimes: matrix.regimes || [],
    cells: matrix.cells || [],
    membership,
    routed,
    pending,
    sitOut: Math.max(total - routed - pending, 0),
  };
}

async function assignStrategyToActiveSet({
  prisma,
  userId,
  targetExperimentId,
  contexts,
  readActiveStrategyConfig,
  writeActiveStrategyConfig,
  createStrategyVersion,
}) {
  const activeStrategy = await readActiveStrategyConfig(userId);
  const [targetExperimentRecord, ownerExperimentRecord] = await prisma.run((db) =>
    Promise.all([
      db.strategyExperiment.findFirst({
        where: { id: targetExperimentId, userId },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 5,
          },
        },
      }),
      activeStrategy?.experimentId
        ? db.strategyExperiment.findFirst({
            where: { id: activeStrategy.experimentId, userId },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 5,
              },
            },
          })
        : Promise.resolve(null),
    ])
  );
  const targetExperiment = strategyStorage.hydrateStrategyExperimentRecord(targetExperimentRecord);
  const ownerExperiment = strategyStorage.hydrateStrategyExperimentRecord(ownerExperimentRecord);

  if (!targetExperiment) {
    throw new Error("Strategy experiment not found.");
  }

  const targetVersion =
    targetExperiment.versions?.[0] ||
    await prisma.run((db) =>
      createStrategyVersion(
        db,
        userId,
        targetExperiment,
        "Recovered missing strategy version before active-set assignment"
      )
    );
  if (!targetVersion) {
    throw new Error("This strategy has no saved version yet.");
  }

  const validation = await getStrategyValidationAggregate(prisma, userId, {
    strategyVersionId: targetVersion.id,
    strategyId: targetExperiment.id,
  });
  const envelope =
    targetVersion.strategyJson?.executable?.envelope ||
    targetExperiment.settingsJson?.strategyJson?.executable?.envelope ||
    {};
  const validContexts = validateAssignableContexts({
    contexts,
    envelope,
    validationBySectorRegime: validation.bySectorRegime,
  });

  const owner = ownerExperiment || targetExperiment;
  const ownerWasActive = activeStrategy?.experimentId
    ? activeStrategy.experimentId === owner.id
    : true;
  const currentMatrix = {
    ...getAllocationMatrixFromExperiment(owner, owner.versions?.[0] || null),
  };

  for (const context of validContexts) {
    currentMatrix[normalizeMatrixKey(context.sector, context.regime)] = {
      strategyVersionId: targetVersion.id,
      experimentId: targetExperiment.id,
      strategyName: targetExperiment.name,
      active: true,
    };
  }

  const nextSettings = mergeAllocationMatrixIntoSettings(
    owner.settingsJson || {},
    currentMatrix
  );

  const activatedAt = new Date();
  const nextOwner = await prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const ownerUpdate = await transaction.strategyExperiment.updateMany({
        where: { id: owner.id, userId },
        data: (() => {
          const encryptedOwner = strategyStorage.encryptExperimentForStorage({
            id: owner.id,
            userId,
            name: owner.name,
            description: owner.description,
            status: ownerWasActive ? "ACTIVE" : owner.status,
            settingsJson: nextSettings,
          });
          return {
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
          };
        })(),
      });

      if (ownerUpdate.count !== 1) {
        throw new Error("Unable to update active deployment set.");
      }

      const updatedOwnerRecord = await transaction.strategyExperiment.findFirst({
        where: { id: owner.id, userId },
      });
      const updatedOwner = strategyStorage.hydrateStrategyExperimentRecord(updatedOwnerRecord);
      const nextVersion = await createStrategyVersion(
        transaction,
        userId,
        updatedOwner,
        `Assigned ${targetExperiment.name} to active set`
      );

      if (ownerWasActive) {
        await transaction.strategyVersion.updateMany({
          where: { userId, deploymentStatus: "ACTIVE" },
          data: { deploymentStatus: "CANDIDATE" },
        });
        await transaction.strategyVersion.updateMany({
          where: { id: nextVersion.id, userId },
          data: {
            deploymentStatus: "ACTIVE",
            activatedAt,
          },
        });
        await transaction.strategyExperiment.updateMany({
          where: { userId, status: "ACTIVE" },
          data: { status: "CANDIDATE" },
        });
        await transaction.strategyExperiment.updateMany({
          where: { id: owner.id, userId },
          data: { status: "ACTIVE" },
        });
        await upsertCanonicalDeploymentRecord(transaction, {
          userId,
          ownerExperimentId: owner.id,
          ownerStrategyVersionId: nextVersion.id,
          runtimeConfiguration: {
            experimentId: owner.id,
            strategyVersionId: nextVersion.id,
            ruleSnapshot: getRuleSnapshot(
              nextVersion.strategyJson || nextSettings.strategyJson || {},
              nextSettings
            ),
          },
          readiness: activeStrategy?.readiness || null,
          reasonNote: `Assigned ${targetExperiment.name} into ${owner.name} active set`,
          action: "ACTIVE_SET_ASSIGNED",
        });
      }

      return {
        ...(updatedOwner || owner),
        settingsJson: nextSettings,
        latestVersion: nextVersion,
      };
    })
  );

  if (ownerWasActive) {
    await writeActiveStrategyConfig(userId, {
      experimentId: nextOwner.id,
      strategyVersionId: nextOwner.latestVersion.id,
      version: nextOwner.latestVersion.version,
      name: nextOwner.name,
      description: nextOwner.description,
      settings: nextSettings,
      strategyJson: nextOwner.latestVersion.strategyJson || nextSettings.strategyJson || null,
      ruleSnapshot: getRuleSnapshot(
        nextOwner.latestVersion.strategyJson || nextSettings.strategyJson || {},
        nextSettings
      ),
      readiness: activeStrategy?.readiness || null,
      activationRules: activeStrategy?.activationRules || null,
    });
  }

  return getActiveSetState({
    prisma,
    userId,
    readActiveStrategyConfig,
  });
}

async function removeStrategyFromActiveSet({
  prisma,
  userId,
  targetExperimentId,
  contexts,
  readActiveStrategyConfig,
  writeActiveStrategyConfig,
  createStrategyVersion,
}) {
  const activeStrategy = await readActiveStrategyConfig(userId);
  if (!activeStrategy?.experimentId) {
    throw new Error("No active deployment set exists yet.");
  }

  const ownerRecord = await prisma.run((db) =>
    db.strategyExperiment.findFirst({
      where: { id: activeStrategy.experimentId, userId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 5,
        },
      },
    })
  );
  const owner = strategyStorage.hydrateStrategyExperimentRecord(ownerRecord);

  if (!owner) {
    throw new Error("Active deployment owner could not be found.");
  }

  const currentMatrix = {
    ...getAllocationMatrixFromExperiment(owner, owner.versions?.[0] || null),
  };
  const contextKeys = (contexts || [])
    .map((context) => normalizeMatrixKey(context?.sector, context?.regime))
    .filter(Boolean);

  if (!contextKeys.length) {
    throw new Error("At least one routed context is required.");
  }

  for (const key of contextKeys) {
    const cell = currentMatrix[key];
    if (!cell) {
      continue;
    }
    if (targetExperimentId && cell.experimentId && cell.experimentId !== targetExperimentId) {
      continue;
    }
    delete currentMatrix[key];
  }

  const nextSettings = mergeAllocationMatrixIntoSettings(
    owner.settingsJson || {},
    currentMatrix
  );

  const activatedAt = new Date();
  const nextOwner = await prisma.run((db) =>
    db.$transaction(async (transaction) => {
      await transaction.strategyExperiment.updateMany({
        where: { id: owner.id, userId },
        data: (() => {
          const encryptedOwner = strategyStorage.encryptExperimentForStorage({
            id: owner.id,
            userId,
            name: owner.name,
            description: owner.description,
            status: "ACTIVE",
            settingsJson: nextSettings,
          });
          return {
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
          };
        })(),
      });

      const updatedOwnerRecord = await transaction.strategyExperiment.findFirst({
        where: { id: owner.id, userId },
      });
      const updatedOwner = strategyStorage.hydrateStrategyExperimentRecord(updatedOwnerRecord);
      const nextVersion = await createStrategyVersion(
        transaction,
        userId,
        updatedOwner,
        "Removed contexts from active set"
      );

      await transaction.strategyVersion.updateMany({
        where: { userId, deploymentStatus: "ACTIVE" },
        data: { deploymentStatus: "CANDIDATE" },
      });
      await transaction.strategyVersion.updateMany({
        where: { id: nextVersion.id, userId },
        data: {
          deploymentStatus: "ACTIVE",
          activatedAt,
        },
      });
      await upsertCanonicalDeploymentRecord(transaction, {
        userId,
        ownerExperimentId: owner.id,
        ownerStrategyVersionId: nextVersion.id,
        runtimeConfiguration: {
          experimentId: owner.id,
          strategyVersionId: nextVersion.id,
          ruleSnapshot: getRuleSnapshot(
            nextVersion.strategyJson || nextSettings.strategyJson || {},
            nextSettings
          ),
        },
        readiness: activeStrategy?.readiness || null,
        reasonNote: "Removed contexts from active set",
        action: "ACTIVE_SET_REMOVED",
      });

      return {
        ...(updatedOwner || owner),
        settingsJson: nextSettings,
        latestVersion: nextVersion,
      };
    })
  );

  await writeActiveStrategyConfig(userId, {
    experimentId: nextOwner.id,
    strategyVersionId: nextOwner.latestVersion.id,
    version: nextOwner.latestVersion.version,
    name: nextOwner.name,
    description: nextOwner.description,
    settings: nextSettings,
    strategyJson: nextOwner.latestVersion.strategyJson || nextSettings.strategyJson || null,
    ruleSnapshot: getRuleSnapshot(
      nextOwner.latestVersion.strategyJson || nextSettings.strategyJson || {},
      nextSettings
    ),
    readiness: activeStrategy?.readiness || null,
    activationRules: activeStrategy?.activationRules || null,
  });

  return getActiveSetState({
    prisma,
    userId,
    readActiveStrategyConfig,
  });
}

async function getStrategyLifecycleDashboard({ prisma, userId, experimentId = null }) {
  const deploymentRecord = await prisma.run((db) =>
    db.strategyDeploymentSet.findUnique({
      where: { userId },
    })
  );
  const experimentRecords = await prisma.run((db) =>
    db.strategyExperiment.findMany({
      where: {
        userId,
        ...(experimentId ? { id: experimentId } : {}),
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 10,
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        walkForwardRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    })
  );
  const experiments = experimentRecords.map((experiment) =>
    strategyStorage.hydrateStrategyExperimentRecord(experiment)
  );
  const dashboards = [];

  for (const experiment of experiments) {
    const latestVersion = getLatestVersion(experiment.versions);
    const activeVersion =
      experiment.versions.find((version) => version.deploymentStatus === "ACTIVE") ||
      (experiment.status === "ACTIVE" ? latestVersion : null);
    const targetVersion = activeVersion || latestVersion;
    const validation = await getStrategyValidationAggregate(prisma, userId, {
      strategyVersionId: targetVersion?.id,
      strategyId: experiment.id,
    });
    const envelope = targetVersion?.strategyJson?.executable?.envelope ||
      experiment.settingsJson?.strategyJson?.executable?.envelope ||
      {};
    const allocationMatrix = targetVersion?.strategyJson?.executable?.allocationMatrix ||
      experiment.settingsJson?.strategyJson?.executable?.allocationMatrix ||
      {};
    const approvals = await prisma.run((db) =>
      db.approvalRequest.findMany({
        where: { userId },
        select: {
          status: true,
          quantity: true,
          entryPrice: true,
          raw: true,
        },
        take: 1000,
        orderBy: { createdAt: "desc" },
      })
    );
    const linkedApprovals = approvals.filter((approval) => {
      const raw = approval.raw || {};
      return (
        raw.strategyVersionId === targetVersion?.id ||
        raw.active_strategy_config?.strategyVersionId === targetVersion?.id ||
        raw.active_strategy_config?.experimentId === experiment.id
      );
    });
    const executedApprovals = linkedApprovals.filter((approval) => approval.status === "EXECUTED");
    const deployedCapital = executedApprovals.reduce(
      (sum, approval) =>
        sum + Math.abs((numberOrNull(approval.quantity) || 0) * (numberOrNull(approval.entryPrice) || 0)),
      0
    );
    const latestRun = experiment.runs?.[0] || null;
    const latestWalkForward = experiment.walkForwardRuns?.[0] || null;
    const validationReturn = numberOrNull(validation.realizedReturn);
    const latestRunReturn = numberOrNull(latestRun?.returnPct);
    const degradation =
      validationReturn !== null && latestRunReturn !== null
        ? round(validationReturn - latestRunReturn)
        : round(latestWalkForward?.returnDecay);

    dashboards.push({
      experimentId: experiment.id,
      name: experiment.name,
      status:
        activeVersion?.id === deploymentRecord?.ownerStrategyVersionId
          ? "ACTIVE"
          : experiment.status,
      activeVersionId: activeVersion?.id || null,
      latestVersionId: latestVersion?.id || null,
      canonicalDeployment: {
        ownerExperimentId: deploymentRecord?.ownerExperimentId || null,
        ownerStrategyVersionId: deploymentRecord?.ownerStrategyVersionId || null,
        active: activeVersion?.id === deploymentRecord?.ownerStrategyVersionId,
      },
      deployedCapital: round(deployedCapital),
      approvalConversion: linkedApprovals.length
        ? round((executedApprovals.length / linkedApprovals.length) * 100)
        : null,
      realizedPerformance: validation,
      degradation,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            returnPct: latestRun.returnPct,
            sharpe: latestRun.sharpe,
            drawdown: latestRun.maxDrawdown,
            tradeCount: latestRun.tradeCount,
          }
        : null,
      latestWalkForward: latestWalkForward
        ? {
            id: latestWalkForward.id,
            stabilityScore: latestWalkForward.stabilityScore,
            oosReturn: latestWalkForward.oosReturn,
            returnDecay: latestWalkForward.returnDecay,
            outOfRegimeStability:
              latestWalkForward.summaryJson?.outOfRegimeStability || null,
          }
        : null,
      envelope,
      allocationMatrixEvidence: buildAllocationMatrixEvidence({
        cellBreakdown: validation.bySectorRegime,
        envelope,
        allocationMatrix,
      }),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    strategies: dashboards,
  };
}

module.exports = {
  DEFAULT_ACTIVATION_RULES,
  activateStrategyVersion,
  assignStrategyToActiveSet,
  buildCanonicalDeployment,
  computeLifecycleReadiness,
  deactivateStrategyDeployment,
  getRuleSnapshot,
  getActiveSetState,
  getActiveDeploymentVersions,
  getStrategyLifecycleDashboard,
  getStrategyLifecycleEvidence,
  getStrategyValidationAggregate,
  mergeActivationRules,
  removeStrategyFromActiveSet,
  resolveCanonicalDeploymentState,
  statusFromReadiness,
  upsertCanonicalDeploymentRecord,
};
