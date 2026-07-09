function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  const numeric = toNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(digits));
}

function average(values = []) {
  const numeric = values.map(toNumber).filter((value) => value !== null);
  if (!numeric.length) {
    return null;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function buildRegimeBreakdown(trades = []) {
  const buckets = new Map();

  for (const trade of trades || []) {
    const snapshot = trade.decisionSnapshot || trade.decision_snapshot || {};
    const regime =
      trade.marketRegime ||
      trade.market_regime ||
      snapshot.marketRegime ||
      "UNKNOWN";
    const bucket = buckets.get(regime) || {
      regime,
      tradeCount: 0,
      wins: 0,
      totalReturn: 0,
      totalPnl: 0,
      totalDrawdown: 0,
      profitableTrades: 0,
    };
    const pnl = toNumber(trade.pnl ?? trade.profit) ?? 0;
    const returnPct = toNumber(trade.returnPct ?? trade.return_pct) ?? 0;
    const drawdown = Math.abs(toNumber(snapshot.maxDrawdown ?? trade.maxDrawdown) ?? 0);

    bucket.tradeCount += 1;
    bucket.totalPnl += pnl;
    bucket.totalReturn += returnPct;
    bucket.totalDrawdown += drawdown;
    if (pnl > 0) {
      bucket.wins += 1;
      bucket.profitableTrades += pnl;
    }

    buckets.set(regime, bucket);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    regime: bucket.regime,
    tradeCount: bucket.tradeCount,
    winRate: round((bucket.wins / Math.max(bucket.tradeCount, 1)) * 100),
    expectancy: round(bucket.totalPnl / Math.max(bucket.tradeCount, 1)),
    averageReturn: round(bucket.totalReturn / Math.max(bucket.tradeCount, 1)),
    averageDrawdown: round(bucket.totalDrawdown / Math.max(bucket.tradeCount, 1)),
    evidenceLevel:
      bucket.tradeCount >= 30
        ? "SUFFICIENT"
        : bucket.tradeCount >= 10
          ? "THIN"
          : "INSUFFICIENT",
  }));
}

function buildMatrixEvidence(regimeBreakdown = [], envelope = {}) {
  const activeRegimes = new Set((envelope.regimes || []).map((item) => String(item).trim()).filter(Boolean));
  return regimeBreakdown.map((row) => {
    const active =
      row.tradeCount >= 30 &&
      row.winRate !== null &&
      row.winRate >= 45 &&
      (!activeRegimes.size || activeRegimes.has(row.regime));
    return {
      ...row,
      active,
      inactiveReason: active ? null : "insufficient evidence",
    };
  });
}

function buildAllocationMatrixEvidence({
  cellBreakdown = [],
  envelope = {},
  allocationMatrix = {},
} = {}) {
  const sectors = [
    ...new Set(
      [
        ...(Array.isArray(envelope.sectors) ? envelope.sectors : []),
        ...cellBreakdown.map((row) => row.sector).filter(Boolean),
      ].map((item) => String(item).trim()).filter(Boolean)
    ),
  ];
  const regimes = [
    ...new Set(
      [
        ...(Array.isArray(envelope.regimes) ? envelope.regimes : []),
        ...cellBreakdown.map((row) => row.regime).filter(Boolean),
      ].map((item) => String(item).trim()).filter(Boolean)
    ),
  ];

  const evidenceByKey = new Map(
    cellBreakdown.map((row) => [
      `${row.sector || "UNKNOWN"}::${row.regime || "UNKNOWN"}`,
      row,
    ])
  );

  const cells = [];
  for (const sector of sectors) {
    for (const regime of regimes) {
      const key = `${sector}::${regime}`;
      const row = evidenceByKey.get(key) || null;
      const configuredCell =
        allocationMatrix?.[key] ||
        allocationMatrix?.[`*::${regime}`] ||
        allocationMatrix?.[`${sector}::*`] ||
        allocationMatrix?.["*::*"] ||
        null;
      const sampleCount = row?.sampleCount ?? row?.tradeCount ?? 0;
      const hitRate = round(row?.hitRate);
      const active =
        Boolean(configuredCell?.active) &&
        sampleCount >= 30 &&
        (hitRate ?? 0) >= 45;

      cells.push({
        key,
        sector,
        regime,
        configured: Boolean(configuredCell),
        experimentId: configuredCell?.experimentId || null,
        strategyVersionId: configuredCell?.strategyVersionId || null,
        strategyName: configuredCell?.strategyName || configuredCell?.name || null,
        allocationPct: round(configuredCell?.allocationPct),
        status: configuredCell?.status || (active ? "ACTIVE" : configuredCell ? "PENDING" : "SIT_OUT"),
        sampleCount,
        hitRate,
        realizedReturn: round(row?.realizedReturn ?? row?.averageReturn),
        active,
        inactiveReason: active
          ? null
          : sampleCount < 30
            ? "insufficient evidence"
            : (hitRate ?? 0) < 45
              ? "weak out-of-sample performance"
              : "not assigned",
      });
    }
  }

  return {
    sectors,
    regimes,
    cells,
  };
}

function computeOutOfRegimeStability(walkForwardRun) {
  const segments = walkForwardRun?.segments || [];
  const trainSegments = segments.filter((segment) => String(segment.phase || "").toUpperCase() === "TRAIN");
  const testSegments = segments.filter((segment) =>
    ["VALIDATE", "TEST"].includes(String(segment.phase || "").toUpperCase())
  );

  const trainReturn = average(trainSegments.map((segment) => segment.returnPct));
  const testReturn = average(testSegments.map((segment) => segment.returnPct));
  if (trainReturn === null || testReturn === null || trainReturn === 0) {
    return null;
  }

  const decay = ((testReturn - trainReturn) / Math.abs(trainReturn)) * 100;
  return {
    trainReturn: round(trainReturn),
    outOfRegimeReturn: round(testReturn),
    returnDecayPct: round(decay),
    pass: decay > -50,
  };
}

module.exports = {
  buildAllocationMatrixEvidence,
  buildRegimeBreakdown,
  buildMatrixEvidence,
  computeOutOfRegimeStability,
};
