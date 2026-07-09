const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const prisma = require("./prisma");
const { requireUserId } = require("../repositories/ownership");

const projectRoot = path.join(__dirname, "..", "..");
const pythonEngineDir = path.join(projectRoot, "python-engine");
const dotVenvPythonPath = path.join(pythonEngineDir, ".venv", "bin", "python");
const venvPythonPath = path.join(pythonEngineDir, "venv", "bin", "python");

const CONFIDENCE_BUCKETS = [
  { key: "0-49", label: "0-49", min: 0, max: 49 },
  { key: "50-59", label: "50-59", min: 50, max: 59 },
  { key: "60-69", label: "60-69", min: 60, max: 69 },
  { key: "70-79", label: "70-79", min: 70, max: 79 },
  { key: "80-89", label: "80-89", min: 80, max: 89 },
  { key: "90-100", label: "90-100", min: 90, max: 100 },
];
const EVALUATION_HORIZONS = [
  { key: "1D", days: 1, returnField: "return1d" },
  { key: "5D", days: 5, returnField: "return5d" },
  { key: "20D", days: 20, returnField: "return20d" },
  { key: "60D", days: 60, returnField: "return60d" },
];
const DEFAULT_EVALUATION_HORIZON = EVALUATION_HORIZONS[1];
const EVALUATION_TIMEOUT_MS = 20000;
let validationColumnSupport = null;

function getPythonPath() {
  if (fs.existsSync(dotVenvPythonPath)) {
    return dotVenvPythonPath;
  }

  return fs.existsSync(venvPythonPath) ? venvPythonPath : "python3";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  const numeric = toNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(digits));
}

function median(values) {
  const numericValues = values
    .map((value) => toNumber(value))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);

  if (numericValues.length === 0) return null;
  const midpoint = Math.floor(numericValues.length / 2);

  return numericValues.length % 2
    ? numericValues[midpoint]
    : (numericValues[midpoint - 1] + numericValues[midpoint]) / 2;
}

function average(values) {
  const numericValues = values
    .map((value) => toNumber(value))
    .filter((value) => value !== null);

  if (numericValues.length === 0) return null;

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function standardDeviation(values) {
  const numericValues = values
    .map((value) => toNumber(value))
    .filter((value) => value !== null);

  if (numericValues.length < 2) return null;
  const mean = average(numericValues);
  const variance =
    numericValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (numericValues.length - 1);

  return Math.sqrt(variance);
}

function mapSignal(signal) {
  return ["BUY", "HOLD", "SELL"].includes(signal) ? signal : "HOLD";
}

function getConfidenceBucket(confidence) {
  const numeric = toNumber(confidence);

  if (numeric === null) {
    return CONFIDENCE_BUCKETS[0];
  }

  const clamped = Math.max(0, Math.min(100, numeric));

  if (clamped < 50) return CONFIDENCE_BUCKETS[0];
  if (clamped < 60) return CONFIDENCE_BUCKETS[1];
  if (clamped < 70) return CONFIDENCE_BUCKETS[2];
  if (clamped < 80) return CONFIDENCE_BUCKETS[3];
  if (clamped < 90) return CONFIDENCE_BUCKETS[4];
  return CONFIDENCE_BUCKETS[5];
}

function getBucketMidpoint(bucketKey) {
  const bucket = CONFIDENCE_BUCKETS.find((candidate) => candidate.key === bucketKey);
  return bucket ? (bucket.min + bucket.max) / 2 : null;
}

function getAdjustmentBucket(value) {
  const numeric = toNumber(value) ?? 0;

  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "neutral";
}

function getReliability(sampleCount) {
  if (sampleCount >= 100) {
    return {
      evidenceScore: "HIGH",
      confidenceLevel: "Statistically stronger",
      message: "Large sample; conclusions are more reliable.",
    };
  }

  if (sampleCount >= 30) {
    return {
      evidenceScore: "MEDIUM",
      confidenceLevel: "Emerging pattern",
      message: "Moderate sample; useful, but keep validating.",
    };
  }

  return {
    evidenceScore: "LOW",
    confidenceLevel: "Insufficient evidence",
    message: "Sample size is too small for precise conclusions.",
  };
}

function buildConfidenceInterval(winRate, sampleCount) {
  const probability = toNumber(winRate);

  if (probability === null || sampleCount <= 0) {
    return null;
  }

  const p = probability / 100;
  const margin = 1.96 * Math.sqrt((p * (1 - p)) / sampleCount);

  return {
    low: round(Math.max(0, (p - margin) * 100)),
    high: round(Math.min(100, (p + margin) * 100)),
  };
}

function calculateBrierScore(predictedConfidence, rows) {
  const prediction = toNumber(predictedConfidence);
  if (prediction === null || rows.length === 0) return null;
  const p = prediction / 100;
  const scores = rows.map((row) => {
    const outcome = row.outcomeDirection === "UP" ? 1 : 0;
    return (p - outcome) ** 2;
  });

  return average(scores);
}

function normalizeValidationSignal(signal) {
  const confidence = toNumber(signal.confidence);
  const bucket = signal.confidenceBucket || getConfidenceBucket(confidence).key;

  return {
    id: signal.id,
    userId: signal.userId,
    symbol: signal.symbol,
    timestamp: signal.timestamp,
    signal: signal.signal,
    confidence,
    confidenceBucket: bucket,
    scannerScore: toNumber(signal.scannerScore),
    marketRegime: signal.marketRegime || "UNKNOWN",
    sector: signal.sector || "Unclassified",
    market: signal.market || signal.raw?.market || "UNKNOWN",
    exchange: signal.exchange || signal.raw?.exchange || "UNKNOWN",
    strategyName: signal.strategyName || signal.raw?.active_strategy?.name || "Default",
    strategyId: signal.strategyId || null,
    strategyVersionId:
      signal.strategyVersionId ||
      signal.raw?.active_strategy?.strategyVersionId ||
      signal.raw?.active_strategy?.strategy_version_id ||
      null,
    fitScore: toNumber(signal.fitScore),
    regimeAtSignal: signal.regimeAtSignal || signal.marketRegime || "UNKNOWN",
    sectorContext: signal.sectorContext || signal.sector || "Unclassified",
    instrumentType: signal.instrumentType || null,
    horizon: signal.horizon || "Swing",
    openAiAdjustment: toNumber(signal.openAiAdjustment) ?? 0,
    newsAdjustment: toNumber(signal.newsAdjustment) ?? 0,
    closePriceAtSignal: toNumber(signal.closePriceAtSignal),
    entryPrice: toNumber(signal.entryPrice ?? signal.closePriceAtSignal),
    exitPrice: toNumber(signal.exitPrice),
    backtestScore: toNumber(signal.backtestScore),
    return1d: toNumber(signal.return1d),
    return3d: toNumber(signal.return3d),
    return5d: toNumber(signal.return5d),
    return10d: toNumber(signal.return10d),
    return20d: toNumber(signal.return20d),
    return60d: toNumber(signal.return60d),
    actualReturn: toNumber(signal.actualReturn),
    maxDrawdown: toNumber(signal.maxDrawdown),
    maxRunup: toNumber(signal.maxRunup),
    maxReturn: toNumber(signal.maxReturn ?? signal.maxRunup),
    minReturn: toNumber(signal.minReturn ?? signal.maxDrawdown),
    drawdown: toNumber(signal.drawdown ?? signal.maxDrawdown),
    evaluationVolatility: toNumber(signal.evaluationVolatility),
    winLoss: signal.winLoss || null,
    outcomeDirection: signal.outcomeDirection || null,
    holdingDays: toNumber(signal.holdingDays),
    evaluationHorizon: signal.evaluationHorizon || null,
    evaluationStatus: signal.evaluationStatus || "PENDING",
    evaluationError: signal.evaluationError || null,
    evaluatedAt: signal.evaluatedAt || null,
    raw: signal.raw || null,
  };
}

function buildSignalFromOpportunity(opportunity, scanResults) {
  const marketRegime = scanResults.market_regime || {};
  const timestamp = scanResults.generated_at || new Date().toISOString();
  const confidenceBreakdown = opportunity.confidence_breakdown || {};
  const confidence =
    toNumber(opportunity.final_confidence) ??
    toNumber(opportunity.confidence);
  const activeStrategy = scanResults.active_strategy || {};
  const activeStrategyConfig = scanResults.active_strategy_config || {};
  const horizon = scanResults.trading_horizon || {};
  const strategyVersionId =
    scanResults.strategy_version_id ||
    activeStrategy.strategyVersionId ||
    activeStrategy.strategy_version_id ||
    activeStrategyConfig.strategyVersionId ||
    activeStrategyConfig.strategy_version_id ||
    null;

  return normalizeValidationSignal({
    id: `${opportunity.symbol}-${timestamp}`,
    symbol: String(opportunity.symbol || "").trim().toUpperCase(),
    timestamp,
    signal: mapSignal(opportunity.signal),
    confidence,
    confidenceBucket: getConfidenceBucket(confidence).key,
    scannerScore: toNumber(opportunity.opportunity_score),
    marketRegime: marketRegime.regime || marketRegime.regime_name || "UNKNOWN",
    sector: opportunity.sector || "Unclassified",
    market: opportunity.market || "UNKNOWN",
    exchange: opportunity.exchange || "UNKNOWN",
    strategyName: activeStrategy.name || opportunity.strategy_name || "Default",
    strategyId: activeStrategy.id || opportunity.strategy_id || null,
    strategyVersionId,
    fitScore:
      toNumber(opportunity.fit_score) ??
      toNumber(opportunity.fitScore) ??
      toNumber(opportunity.portfolio_fit_score),
    regimeAtSignal:
      opportunity.regime_at_signal ||
      opportunity.regimeAtSignal ||
      marketRegime.regime ||
      marketRegime.regime_name ||
      "UNKNOWN",
    sectorContext: opportunity.sector_context || opportunity.sector || "Unclassified",
    instrumentType: opportunity.instrument_type || opportunity.instrumentType || null,
    horizon: horizon.name || horizon.horizon || scanResults.horizon || "Swing",
    openAiAdjustment:
      toNumber(confidenceBreakdown.openai_adjustment) ??
      toNumber(opportunity.openai_news_reasoning?.confidence_adjustment) ??
      0,
    newsAdjustment:
      toNumber(confidenceBreakdown.news_adjustment) ??
      toNumber(opportunity.news_filter?.confidence_adjustment) ??
      0,
    closePriceAtSignal: toNumber(opportunity.close),
    entryPrice: toNumber(opportunity.close),
    backtestScore: toNumber(opportunity.backtest_return),
    evaluationStatus: "PENDING",
    raw: {
      ...opportunity,
      active_strategy: activeStrategy,
      active_strategy_config: activeStrategyConfig,
      trading_horizon: horizon,
    },
  });
}

async function getValidationColumnSupport(db) {
  if (validationColumnSupport !== null) {
    return validationColumnSupport;
  }

  try {
    const columns = await db.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'ValidationSignal'
        AND column_name IN (
          'strategyVersionId',
          'fitScore',
          'regimeAtSignal',
          'sectorContext',
          'instrumentType'
        )
    `;
    const names = new Set(columns.map((column) => column.column_name));
    validationColumnSupport = {
      strategyVersionId: names.has("strategyVersionId"),
      conditioning:
        names.has("fitScore") &&
        names.has("regimeAtSignal") &&
        names.has("sectorContext") &&
        names.has("instrumentType"),
    };
  } catch (_error) {
    validationColumnSupport = {
      strategyVersionId: false,
      conditioning: false,
    };
  }

  return validationColumnSupport;
}

async function persistValidationSignalsToPrisma(signals, userId) {
  const ownerId = requireUserId(userId);
  if (signals.length === 0) {
    return 0;
  }

  return prisma.run(async (db) => {
    let count = 0;

    for (const signal of signals) {
      const columnSupport = await getValidationColumnSupport(db);
      if (columnSupport.strategyVersionId && columnSupport.conditioning) {
        await db.$executeRaw`
          INSERT INTO "ValidationSignal" (
            "id",
            "userId",
            "symbol",
            "timestamp",
            "signal",
            "confidence",
            "confidenceBucket",
            "scannerScore",
            "marketRegime",
            "sector",
            "market",
            "exchange",
            "strategyName",
            "strategyId",
            "strategyVersionId",
            "fitScore",
            "regimeAtSignal",
            "sectorContext",
            "instrumentType",
            "horizon",
            "openAiAdjustment",
            "newsAdjustment",
            "closePriceAtSignal",
            "entryPrice",
            "backtestScore",
            "evaluationStatus",
            "raw"
          )
          VALUES (
            ${signal.id},
            ${ownerId},
            ${signal.symbol},
            ${new Date(signal.timestamp)},
            ${signal.signal}::"Signal",
            ${signal.confidence},
            ${signal.confidenceBucket},
            ${signal.scannerScore},
            ${signal.marketRegime},
            ${signal.sector},
            ${signal.market},
            ${signal.exchange},
            ${signal.strategyName},
            ${signal.strategyId},
            ${signal.strategyVersionId},
            ${signal.fitScore},
            ${signal.regimeAtSignal},
            ${signal.sectorContext},
            ${signal.instrumentType},
            ${signal.horizon},
            ${signal.openAiAdjustment},
            ${signal.newsAdjustment},
            ${signal.closePriceAtSignal},
            ${signal.entryPrice},
            ${signal.backtestScore},
            'PENDING'::"ValidationEvaluationStatus",
            ${JSON.stringify(signal.raw || {})}::jsonb
          )
          ON CONFLICT ("userId", "symbol", "timestamp") DO UPDATE SET
            "signal" = EXCLUDED."signal",
            "confidence" = EXCLUDED."confidence",
            "confidenceBucket" = EXCLUDED."confidenceBucket",
            "scannerScore" = EXCLUDED."scannerScore",
            "marketRegime" = EXCLUDED."marketRegime",
            "sector" = EXCLUDED."sector",
            "market" = EXCLUDED."market",
            "exchange" = EXCLUDED."exchange",
            "strategyName" = EXCLUDED."strategyName",
            "strategyId" = EXCLUDED."strategyId",
            "strategyVersionId" = EXCLUDED."strategyVersionId",
            "fitScore" = EXCLUDED."fitScore",
            "regimeAtSignal" = EXCLUDED."regimeAtSignal",
            "sectorContext" = EXCLUDED."sectorContext",
            "instrumentType" = EXCLUDED."instrumentType",
            "horizon" = EXCLUDED."horizon",
            "openAiAdjustment" = EXCLUDED."openAiAdjustment",
            "newsAdjustment" = EXCLUDED."newsAdjustment",
            "closePriceAtSignal" = EXCLUDED."closePriceAtSignal",
            "entryPrice" = EXCLUDED."entryPrice",
            "backtestScore" = EXCLUDED."backtestScore",
            "raw" = EXCLUDED."raw"
          WHERE "ValidationSignal"."evaluationStatus" = 'PENDING'
        `;
      } else if (columnSupport.strategyVersionId) {
        await db.$executeRaw`
          INSERT INTO "ValidationSignal" (
            "id",
            "userId",
            "symbol",
            "timestamp",
            "signal",
            "confidence",
            "confidenceBucket",
            "scannerScore",
            "marketRegime",
            "sector",
            "market",
            "exchange",
            "strategyName",
            "strategyId",
            "strategyVersionId",
            "horizon",
            "openAiAdjustment",
            "newsAdjustment",
            "closePriceAtSignal",
            "entryPrice",
            "backtestScore",
            "evaluationStatus",
            "raw"
          )
          VALUES (
            ${signal.id},
            ${ownerId},
            ${signal.symbol},
            ${new Date(signal.timestamp)},
            ${signal.signal}::"Signal",
            ${signal.confidence},
            ${signal.confidenceBucket},
            ${signal.scannerScore},
            ${signal.marketRegime},
            ${signal.sector},
            ${signal.market},
            ${signal.exchange},
            ${signal.strategyName},
            ${signal.strategyId},
            ${signal.strategyVersionId},
            ${signal.horizon},
            ${signal.openAiAdjustment},
            ${signal.newsAdjustment},
            ${signal.closePriceAtSignal},
            ${signal.entryPrice},
            ${signal.backtestScore},
            'PENDING'::"ValidationEvaluationStatus",
            ${JSON.stringify(signal.raw || {})}::jsonb
          )
          ON CONFLICT ("userId", "symbol", "timestamp") DO UPDATE SET
            "signal" = EXCLUDED."signal",
            "confidence" = EXCLUDED."confidence",
            "confidenceBucket" = EXCLUDED."confidenceBucket",
            "scannerScore" = EXCLUDED."scannerScore",
            "marketRegime" = EXCLUDED."marketRegime",
            "sector" = EXCLUDED."sector",
            "market" = EXCLUDED."market",
            "exchange" = EXCLUDED."exchange",
            "strategyName" = EXCLUDED."strategyName",
            "strategyId" = EXCLUDED."strategyId",
            "strategyVersionId" = EXCLUDED."strategyVersionId",
            "horizon" = EXCLUDED."horizon",
            "openAiAdjustment" = EXCLUDED."openAiAdjustment",
            "newsAdjustment" = EXCLUDED."newsAdjustment",
            "closePriceAtSignal" = EXCLUDED."closePriceAtSignal",
            "entryPrice" = EXCLUDED."entryPrice",
            "backtestScore" = EXCLUDED."backtestScore",
            "raw" = EXCLUDED."raw"
          WHERE "ValidationSignal"."evaluationStatus" = 'PENDING'
        `;
      } else {
        await db.$executeRaw`
        INSERT INTO "ValidationSignal" (
          "id",
          "userId",
          "symbol",
          "timestamp",
          "signal",
          "confidence",
          "confidenceBucket",
          "scannerScore",
          "marketRegime",
          "sector",
          "market",
          "exchange",
          "strategyName",
          "strategyId",
          "horizon",
          "openAiAdjustment",
          "newsAdjustment",
          "closePriceAtSignal",
          "entryPrice",
          "backtestScore",
          "evaluationStatus",
          "raw"
        )
        VALUES (
          ${signal.id},
          ${ownerId},
          ${signal.symbol},
          ${new Date(signal.timestamp)},
          ${signal.signal}::"Signal",
          ${signal.confidence},
          ${signal.confidenceBucket},
          ${signal.scannerScore},
          ${signal.marketRegime},
          ${signal.sector},
          ${signal.market},
          ${signal.exchange},
          ${signal.strategyName},
          ${signal.strategyId},
          ${signal.horizon},
          ${signal.openAiAdjustment},
          ${signal.newsAdjustment},
          ${signal.closePriceAtSignal},
          ${signal.entryPrice},
          ${signal.backtestScore},
          'PENDING'::"ValidationEvaluationStatus",
          ${JSON.stringify(signal.raw || {})}::jsonb
        )
        ON CONFLICT ("userId", "symbol", "timestamp") DO UPDATE SET
          "signal" = EXCLUDED."signal",
          "confidence" = EXCLUDED."confidence",
          "confidenceBucket" = EXCLUDED."confidenceBucket",
          "scannerScore" = EXCLUDED."scannerScore",
          "marketRegime" = EXCLUDED."marketRegime",
          "sector" = EXCLUDED."sector",
          "market" = EXCLUDED."market",
          "exchange" = EXCLUDED."exchange",
          "strategyName" = EXCLUDED."strategyName",
          "strategyId" = EXCLUDED."strategyId",
          "horizon" = EXCLUDED."horizon",
          "openAiAdjustment" = EXCLUDED."openAiAdjustment",
          "newsAdjustment" = EXCLUDED."newsAdjustment",
          "closePriceAtSignal" = EXCLUDED."closePriceAtSignal",
          "entryPrice" = EXCLUDED."entryPrice",
          "backtestScore" = EXCLUDED."backtestScore",
          "raw" = EXCLUDED."raw"
        WHERE "ValidationSignal"."evaluationStatus" = 'PENDING'
      `;
      }
      count += 1;
    }

    return count;
  });
}

async function persistValidationSignalsFromScanResults(scanResults, userId) {
  const ownerId = requireUserId(userId);
  const signals = (scanResults.opportunities || [])
    .map((opportunity) => {
      const signal = buildSignalFromOpportunity(opportunity, scanResults);
      return {
        ...signal,
        id: `${ownerId}-${signal.id}`,
      };
    })
    .filter((signal) => signal.symbol);

  return persistValidationSignalsToPrisma(signals, ownerId);
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  const jsonLine = trimmed
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{") || line.trim().startsWith("["));

  return JSON.parse(jsonLine || trimmed);
}

function fetchSymbolPrices(symbol, period = "1y") {
  return new Promise((resolve, reject) => {
    const script = [
      "import json, sys",
      "from market_data import get_historical_data",
      "symbol = sys.argv[1]",
      "period = sys.argv[2]",
      "df = get_historical_data(symbol, period=period)",
      "rows = []",
      "for _, row in df.iterrows():",
      "    close = row.get('close')",
      "    if close == close:",
      "        rows.append({'date': str(row['date']), 'close': float(close)})",
      "print(json.dumps(rows, allow_nan=False))",
    ].join("\n");
    const child = spawn(getPythonPath(), ["-c", script, symbol, period], {
      cwd: pythonEngineDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Validation price fetch timed out."));
    }, EVALUATION_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const error = new Error("Unable to fetch validation prices.");
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

function getFuturePrices(signal, prices) {
  const signalTime = new Date(signal.timestamp).getTime();

  return prices
    .filter((price) => new Date(price.date).getTime() > signalTime)
    .map((price) => ({
      date: price.date,
      close: toNumber(price.close),
    }))
    .filter((price) => price.close !== null);
}

function calculateEvaluation(signal, prices, horizon = DEFAULT_EVALUATION_HORIZON) {
  const futurePrices = getFuturePrices(signal, prices);
  const entry = toNumber(signal.closePriceAtSignal ?? signal.entryPrice);

  if (!entry || futurePrices.length < horizon.days) {
    return null;
  }

  const returnsByHorizon = {};
  for (const horizonSpec of EVALUATION_HORIZONS) {
    const exit = futurePrices[horizonSpec.days - 1]?.close;
    returnsByHorizon[horizonSpec.returnField] =
      exit === undefined ? null : ((exit - entry) / entry) * 100;
  }

  const evaluationWindow = futurePrices.slice(0, horizon.days);
  const exitPrice = evaluationWindow[evaluationWindow.length - 1]?.close;
  const pathReturns = evaluationWindow.map((price) => ((price.close - entry) / entry) * 100);
  const actualReturn = ((exitPrice - entry) / entry) * 100;
  const maxReturn = Math.max(...pathReturns);
  const minReturn = Math.min(...pathReturns);

  return {
    ...returnsByHorizon,
    entryPrice: entry,
    exitPrice,
    actualReturn,
    maxDrawdown: minReturn,
    maxRunup: maxReturn,
    maxReturn,
    minReturn,
    drawdown: minReturn,
    evaluationVolatility: standardDeviation(pathReturns),
    winLoss: actualReturn > 0 ? "WIN" : "LOSS",
    outcomeDirection: actualReturn > 0 ? "UP" : actualReturn < 0 ? "DOWN" : "FLAT",
    holdingDays: horizon.days,
    evaluationHorizon: horizon.key,
    evaluationStatus: "MATURED",
    evaluatedAt: new Date().toISOString(),
  };
}

function maturityCutoffDate(horizon = DEFAULT_EVALUATION_HORIZON, now = new Date()) {
  return new Date(now.getTime() - horizon.days * 24 * 60 * 60 * 1000);
}

async function readPendingMatureSignals(userId, { limit = 50, horizon = DEFAULT_EVALUATION_HORIZON } = {}) {
  const ownerId = requireUserId(userId);
  const cutoff = maturityCutoffDate(horizon);
  const rows = await prisma.run((db) =>
    db.validationSignal.findMany({
      where: {
        userId: ownerId,
        evaluationStatus: "PENDING",
        timestamp: { lte: cutoff },
      },
      orderBy: { timestamp: "asc" },
      take: limit,
    })
  );
  return rows.map(normalizeValidationSignal);
}

async function updateEvaluation(userId, signal, evaluation) {
  const ownerId = requireUserId(userId);
  await prisma.run((db) => db.$executeRaw`
    UPDATE "ValidationSignal"
    SET
      "entryPrice" = ${evaluation.entryPrice},
      "exitPrice" = ${evaluation.exitPrice},
      "return1d" = ${evaluation.return1d},
      "return3d" = ${evaluation.return3d},
      "return5d" = ${evaluation.return5d},
      "return10d" = ${evaluation.return10d},
      "return20d" = ${evaluation.return20d},
      "return60d" = ${evaluation.return60d},
      "actualReturn" = ${evaluation.actualReturn},
      "maxDrawdown" = ${evaluation.maxDrawdown},
      "maxRunup" = ${evaluation.maxRunup},
      "maxReturn" = ${evaluation.maxReturn},
      "minReturn" = ${evaluation.minReturn},
      "drawdown" = ${evaluation.drawdown},
      "evaluationVolatility" = ${evaluation.evaluationVolatility},
      "winLoss" = ${evaluation.winLoss},
      "outcomeDirection" = ${evaluation.outcomeDirection},
      "holdingDays" = ${evaluation.holdingDays},
      "evaluationHorizon" = ${evaluation.evaluationHorizon},
      "evaluationStatus" = 'MATURED'::"ValidationEvaluationStatus",
      "evaluationError" = NULL,
      "evaluatedAt" = ${new Date(evaluation.evaluatedAt)}
    WHERE "id" = ${signal.id}
      AND "userId" = ${ownerId}
      AND "evaluationStatus" = 'PENDING'::"ValidationEvaluationStatus"
  `);
}

async function markEvaluationFailure(userId, signal, error, status = "FAILED") {
  const ownerId = requireUserId(userId);
  await prisma.run((db) => db.$executeRaw`
    UPDATE "ValidationSignal"
    SET
      "evaluationStatus" = ${status}::"ValidationEvaluationStatus",
      "evaluationError" = ${String(error.message || error).slice(0, 500)}
    WHERE "id" = ${signal.id}
      AND "userId" = ${ownerId}
      AND "evaluationStatus" = 'PENDING'::"ValidationEvaluationStatus"
  `);
}

async function evaluateValidationSignals(userId, { limit = 100, horizonKey = "5D" } = {}) {
  const ownerId = requireUserId(userId);
  const horizon =
    EVALUATION_HORIZONS.find((candidate) => candidate.key === horizonKey) ||
    DEFAULT_EVALUATION_HORIZON;
  const signals = await readPendingMatureSignals(ownerId, { limit, horizon });
  let evaluated = 0;
  let failed = 0;
  let skipped = 0;

  for (const signal of signals) {
    try {
      const prices = await fetchSymbolPrices(signal.symbol);
      const evaluation = calculateEvaluation(signal, prices, horizon);

      if (!evaluation) {
        await markEvaluationFailure(
          ownerId,
          signal,
          new Error(`Not enough future prices for ${horizon.key}.`),
          "SKIPPED"
        );
        skipped += 1;
        continue;
      }

      await updateEvaluation(ownerId, signal, evaluation);
      evaluated += 1;
    } catch (error) {
      await markEvaluationFailure(ownerId, signal, error, "FAILED");
      failed += 1;
      console.error(`Validation evaluation failed for ${signal.symbol}: ${error.message}`);
    }
  }

  if (evaluated > 0) {
    await persistCalibrationMetrics(ownerId);
  }

  return {
    evaluated,
    failed,
    skipped,
    scanned: signals.length,
    horizon: horizon.key,
  };
}

async function runValidationEvaluationJob(userId, options = {}) {
  return evaluateValidationSignals(userId, options);
}

async function readValidationSignals(userId) {
  const ownerId = requireUserId(userId);
  const rows = await prisma.run((db) =>
    db.validationSignal.findMany({
      where: { userId: ownerId },
      orderBy: { timestamp: "asc" },
    })
  );
  return rows.map(normalizeValidationSignal);
}

function getOutcomeReturn(signal, horizonKey = "5D") {
  if (signal.actualReturn !== null && signal.evaluationHorizon === horizonKey) {
    return signal.actualReturn;
  }

  const horizon = EVALUATION_HORIZONS.find((candidate) => candidate.key === horizonKey);
  return horizon ? toNumber(signal[horizon.returnField]) : toNumber(signal.actualReturn);
}

function getEvaluatedRows(rows, horizonKey = "5D") {
  return rows.filter(
    (row) => row.evaluationStatus === "MATURED" && getOutcomeReturn(row, horizonKey) !== null
  );
}

function summarizeGroup(key, rows, label = key, horizonKey = "5D") {
  const outcomeRows = getEvaluatedRows(rows, horizonKey);
  const wins = outcomeRows.filter((row) => {
    if (row.outcomeDirection) return row.outcomeDirection === "UP";
    if (row.winLoss) return row.winLoss === "WIN";
    return getOutcomeReturn(row, horizonKey) > 0;
  }).length;
  const predictedConfidence = round(average(rows.map((row) => row.confidence)));
  const actualWinRate =
    outcomeRows.length > 0 ? round((wins / outcomeRows.length) * 100) : null;
  const returns = outcomeRows.map((row) => getOutcomeReturn(row, horizonKey));
  const reliability = getReliability(outcomeRows.length);

  return {
    key,
    label,
    samples: rows.length,
    sampleCount: outcomeRows.length,
    outcome_samples: outcomeRows.length,
    predictedConfidence,
    actualWinRate,
    historicalWinProbability: actualWinRate,
    average_return: round(average(returns)),
    average_next_period_return: round(average(returns)),
    medianReturn: round(median(returns)),
    win_rate: actualWinRate,
    average_drawdown: round(average(outcomeRows.map((row) => row.drawdown))),
    average_backtest_score: round(average(rows.map((row) => row.backtestScore))),
    average_backtest_return: round(average(rows.map((row) => row.backtestScore))),
    average_opportunity_score: round(average(rows.map((row) => row.scannerScore))),
    calibrationError:
      predictedConfidence !== null && actualWinRate !== null
        ? round(actualWinRate - predictedConfidence)
        : null,
    brierScore: round(calculateBrierScore(predictedConfidence, outcomeRows), 4),
    confidenceInterval: buildConfidenceInterval(actualWinRate, outcomeRows.length),
    evidenceScore: reliability.evidenceScore,
    confidenceLevel: reliability.confidenceLevel,
    reliabilityMessage: reliability.message,
    supportingSignals: outcomeRows.slice(0, 25).map((row) => row.id),
  };
}

function groupRows(rows, keyGetter, labels = {}, horizonKey = "5D") {
  const groups = new Map();

  for (const row of rows) {
    const key = keyGetter(row) || "UNKNOWN";

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .map(([key, groupRowsForKey]) =>
      summarizeGroup(key, groupRowsForKey, labels[key] || key, horizonKey)
    )
    .sort((left, right) => right.samples - left.samples);
}

function buildConfidenceGroups(rows, horizonKey = "5D") {
  return CONFIDENCE_BUCKETS.map((bucket) =>
    summarizeGroup(
      bucket.key,
      rows.filter((row) => getConfidenceBucket(row.confidence).key === bucket.key),
      bucket.label,
      horizonKey
    )
  );
}

function buildDiagnostics(rows) {
  const signals = rows.length;
  const matured = rows.filter((row) => row.evaluationStatus === "MATURED").length;
  const failed = rows.filter((row) => row.evaluationStatus === "FAILED").length;
  const skipped = rows.filter((row) => row.evaluationStatus === "SKIPPED").length;
  const pending = rows.filter((row) => row.evaluationStatus === "PENDING").length;
  const evaluated = matured;
  const coverage = signals > 0 ? (evaluated / signals) * 100 : 0;
  const confidenceValues = rows.map((row) => row.confidence).filter((value) => value !== null);
  const currentConfidence = average(confidenceValues.slice(-100));
  const historicalConfidence = average(confidenceValues);
  const evaluatedRows = getEvaluatedRows(rows);
  const recentEvaluated = evaluatedRows.slice(-100);
  const historicalReturn = average(evaluatedRows.map((row) => getOutcomeReturn(row)));
  const currentReturn = average(recentEvaluated.map((row) => getOutcomeReturn(row)));

  return {
    signalsGenerated: signals,
    signalsMatured: matured,
    signalsEvaluated: evaluated,
    evaluationFailures: failed,
    skipped,
    pendingMaturity: pending,
    coverage: round(coverage),
    currentConfidence: round(currentConfidence),
    historicalConfidence: round(historicalConfidence),
    calibrationDrift:
      currentConfidence !== null && historicalConfidence !== null
        ? round(currentConfidence - historicalConfidence)
        : null,
    returnDrift:
      currentReturn !== null && historicalReturn !== null
        ? round(currentReturn - historicalReturn)
        : null,
    regimeDrift: null,
  };
}

function buildDeterministicInsights({ confidence, regime, sector, exchange }) {
  const insights = [];
  const evaluatedConfidence = confidence.filter((group) => group.sampleCount > 0);

  if (evaluatedConfidence.length === 0) {
    return insights;
  }

  const eighty = confidence.find((group) => group.key === "80-89");
  const ninety = confidence.find((group) => group.key === "90-100");

  if (
    eighty?.sampleCount >= 30 &&
    ninety?.sampleCount >= 30 &&
    toNumber(eighty.average_return) > toNumber(ninety.average_return)
  ) {
    insights.push({
      type: "CONFIDENCE_BUCKET_INVERSION",
      title: "80-89 outperformed 90-100",
      explanation: "The 80-89 confidence bucket has stronger observed returns than 90-100.",
      sampleCount: eighty.sampleCount + ninety.sampleCount,
      supportingSignals: [...eighty.supportingSignals, ...ninety.supportingSignals],
      confidenceLevel: getReliability(eighty.sampleCount + ninety.sampleCount).confidenceLevel,
      generatedAt: new Date().toISOString(),
    });
  }

  const weakRegimes = regime.filter(
    (group) => group.sampleCount >= 30 && toNumber(group.average_return) < 0
  );
  for (const group of weakRegimes.slice(0, 3)) {
    insights.push({
      type: "REGIME_WEAKNESS",
      title: `Weak outcomes in ${group.label}`,
      explanation: `${group.label} has negative observed average return.`,
      sampleCount: group.sampleCount,
      supportingSignals: group.supportingSignals,
      confidenceLevel: group.confidenceLevel,
      generatedAt: new Date().toISOString(),
    });
  }

  const bestExchange = [...exchange]
    .filter((group) => group.sampleCount >= 30)
    .sort((left, right) => (right.average_return || 0) - (left.average_return || 0))[0];
  if (bestExchange) {
    insights.push({
      type: "EXCHANGE_STRENGTH",
      title: `${bestExchange.label} has the strongest observed exchange outcomes`,
      explanation: `${bestExchange.label} leads evaluated exchange groups by average return.`,
      sampleCount: bestExchange.sampleCount,
      supportingSignals: bestExchange.supportingSignals,
      confidenceLevel: bestExchange.confidenceLevel,
      generatedAt: new Date().toISOString(),
    });
  }

  const bestSector = [...sector]
    .filter((group) => group.sampleCount >= 30)
    .sort((left, right) => (right.average_return || 0) - (left.average_return || 0))[0];
  if (bestSector) {
    insights.push({
      type: "SECTOR_STRENGTH",
      title: `${bestSector.label} has the strongest observed sector outcomes`,
      explanation: `${bestSector.label} leads evaluated sector groups by average return.`,
      sampleCount: bestSector.sampleCount,
      supportingSignals: bestSector.supportingSignals,
      confidenceLevel: bestSector.confidenceLevel,
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

async function persistCalibrationMetrics(userId, horizonKey = "5D") {
  const ownerId = requireUserId(userId);
  const rows = await readValidationSignals(ownerId);
  const confidence = buildConfidenceGroups(rows, horizonKey);
  const metrics = confidence
    .filter((group) => group.sampleCount > 0)
    .map((group) => ({
      userId: ownerId,
      dimension: "confidence",
      bucket: group.key,
      horizon: horizonKey,
      predictedConfidence: group.predictedConfidence,
      actualWinRate: group.actualWinRate,
      avgReturn: group.average_return,
      medianReturn: group.medianReturn,
      sampleCount: group.sampleCount,
      calibrationError: group.calibrationError,
      brierScore: group.brierScore,
      confidenceInterval: group.confidenceInterval,
      evidenceScore: group.evidenceScore,
      supportingSignalIds: group.supportingSignals,
    }));

  if (!metrics.length) {
    return 0;
  }

  await prisma.run((db) => db.calibrationMetric.createMany({ data: metrics }));
  return metrics.length;
}

function buildSampleGrowth(rows) {
  const byDate = new Map();

  for (const row of rows) {
    const key = new Date(row.timestamp).toISOString().slice(0, 10);
    const current = byDate.get(key) || { date: key, signals: 0, evaluated: 0 };
    current.signals += 1;
    if (row.evaluationStatus === "MATURED") current.evaluated += 1;
    byDate.set(key, current);
  }

  let cumulativeSignals = 0;
  let cumulativeEvaluated = 0;
  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => {
      cumulativeSignals += point.signals;
      cumulativeEvaluated += point.evaluated;
      return {
        ...point,
        cumulativeSignals,
        cumulativeEvaluated,
      };
    });
}

function buildCalibrationDrift(rows) {
  const evaluated = getEvaluatedRows(rows);
  const bucketsByMonth = new Map();

  for (const row of evaluated) {
    const month = new Date(row.timestamp).toISOString().slice(0, 7);
    if (!bucketsByMonth.has(month)) bucketsByMonth.set(month, []);
    bucketsByMonth.get(month).push(row);
  }

  return [...bucketsByMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, monthRows]) => {
      const predictedConfidence = average(monthRows.map((row) => row.confidence));
      const wins = monthRows.filter((row) => row.outcomeDirection === "UP").length;
      const actualWinRate = monthRows.length ? (wins / monthRows.length) * 100 : null;
      return {
        month,
        predictedConfidence: round(predictedConfidence),
        actualWinRate: round(actualWinRate),
        calibrationError:
          predictedConfidence !== null && actualWinRate !== null
            ? round(actualWinRate - predictedConfidence)
            : null,
        sampleCount: monthRows.length,
      };
    });
}

async function getValidationDashboard(userId, { evaluate = false } = {}) {
  const ownerId = requireUserId(userId);
  if (evaluate) {
    await runValidationEvaluationJob(ownerId, { limit: 100 });
  }

  const rows = await readValidationSignals(ownerId);
  const confidence = buildConfidenceGroups(rows);
  const regime = groupRows(rows, (row) => row.marketRegime);
  const sector = groupRows(rows, (row) => row.sector);
  const exchange = groupRows(rows, (row) => row.exchange);
  const strategy = groupRows(rows, (row) => row.strategyName);
  const horizon = groupRows(rows, (row) => row.horizon);
  const openaiImpact = groupRows(rows, (row) => getAdjustmentBucket(row.openAiAdjustment), {
    positive: "OpenAI Positive",
    negative: "OpenAI Negative",
    neutral: "OpenAI Neutral",
  });
  const newsImpact = groupRows(rows, (row) => getAdjustmentBucket(row.newsAdjustment), {
    positive: "News Positive",
    negative: "News Negative",
    neutral: "News Neutral",
  });
  const diagnostics = buildDiagnostics(rows);
  const insights = buildDeterministicInsights({
    confidence,
    regime,
    sector,
    exchange,
  });

  return {
    generated_at: new Date().toISOString(),
    dataset_built: rows.length > 0,
    is_mock_data: false,
    empty_state_message:
      rows.length === 0
        ? "Collecting evidence. Run scans and allow signals to mature."
        : null,
    calibration_ready: diagnostics.signalsEvaluated > 0,
    horizons: EVALUATION_HORIZONS.map((item) => item.key),
    totals: {
      signals: rows.length,
      evaluated: diagnostics.signalsEvaluated,
      displayed: rows.length,
    },
    diagnostics,
    confidence,
    regime,
    sector,
    exchange,
    strategy,
    horizon,
    openai_impact: openaiImpact,
    news_impact: newsImpact,
    sample_growth: buildSampleGrowth(rows),
    calibration_drift: buildCalibrationDrift(rows),
    maturity_funnel: [
      { key: "Signals Generated", value: diagnostics.signalsGenerated },
      { key: "Pending Maturity", value: diagnostics.pendingMaturity },
      { key: "Evaluated", value: diagnostics.signalsEvaluated },
      { key: "Failed", value: diagnostics.evaluationFailures },
      { key: "Skipped", value: diagnostics.skipped },
    ],
    insights,
    warnings: buildWarnings(confidence, openaiImpact, regime, diagnostics),
  };
}

function buildWarnings(confidenceGroups, openAiGroups, regimeGroups, diagnostics) {
  const warnings = [];

  if (diagnostics.signalsGenerated === 0) {
    warnings.push({
      type: "VALIDATION_DATASET_NOT_BUILT",
      severity: "MEDIUM",
      message: "Collecting evidence. Run scans and allow signals to mature.",
    });
    return warnings;
  }

  if (diagnostics.signalsEvaluated === 0) {
    warnings.push({
      type: "OUTCOMES_NOT_READY",
      severity: "MEDIUM",
      message: "Signals exist, but no matured outcomes have been evaluated yet.",
    });
    return warnings;
  }

  for (const group of confidenceGroups) {
    if (group.samples > 0 && group.sampleCount < 30) {
      warnings.push({
        type: "LOW_SAMPLE_SIZE",
        severity: "MEDIUM",
        message: `${group.label} confidence has only ${group.sampleCount} evaluated samples.`,
      });
    }
  }

  const highConfidenceReturn = average(
    confidenceGroups
      .filter((group) => ["80-89", "90-100"].includes(group.key))
      .map((group) => group.average_return)
  );
  const lowerConfidenceReturn = average(
    confidenceGroups
      .filter((group) => ["50-59", "60-69"].includes(group.key))
      .map((group) => group.average_return)
  );

  if (
    highConfidenceReturn !== null &&
    lowerConfidenceReturn !== null &&
    highConfidenceReturn <= lowerConfidenceReturn
  ) {
    warnings.push({
      type: "HIGH_CONFIDENCE_UNDERPERFORMING",
      severity: "HIGH",
      message: "High-confidence opportunities are not outperforming lower-confidence buckets.",
    });
  }

  const positiveOpenAi = openAiGroups.find((group) => group.key === "positive");
  const neutralOpenAi = openAiGroups.find((group) => group.key === "neutral");

  if (
    positiveOpenAi?.sampleCount >= 30 &&
    neutralOpenAi?.sampleCount >= 30 &&
    toNumber(positiveOpenAi.average_return) <= toNumber(neutralOpenAi.average_return)
  ) {
    warnings.push({
      type: "OPENAI_ADJUSTMENTS_NOT_IMPROVING",
      severity: "MEDIUM",
      message: "Positive OpenAI adjustments are not improving outcomes versus neutral adjustments.",
    });
  }

  if (
    regimeGroups.length > 1 &&
    regimeGroups.every((group) => Math.abs(toNumber(group.average_return) || 0) < 1)
  ) {
    warnings.push({
      type: "REGIME_FILTER_WEAK",
      severity: "MEDIUM",
      message: "Market regime groups show weak separation in evaluated returns.",
    });
  }

  return warnings;
}

async function getConfidenceValidation(userId) {
  const dashboard = await getValidationDashboard(userId);
  return {
    generated_at: dashboard.generated_at,
    dataset_built: dashboard.dataset_built,
    is_mock_data: dashboard.is_mock_data,
    empty_state_message: dashboard.empty_state_message,
    totals: dashboard.totals,
    diagnostics: dashboard.diagnostics,
    confidence: dashboard.confidence,
    warnings: dashboard.warnings,
  };
}

async function getRegimeValidation(userId) {
  const dashboard = await getValidationDashboard(userId);
  return {
    generated_at: dashboard.generated_at,
    regime: dashboard.regime,
  };
}

async function getSectorValidation(userId) {
  const dashboard = await getValidationDashboard(userId);
  return {
    generated_at: dashboard.generated_at,
    sector: dashboard.sector,
  };
}

async function getOpenAiImpactValidation(userId) {
  const dashboard = await getValidationDashboard(userId);
  return {
    generated_at: dashboard.generated_at,
    openai_impact: dashboard.openai_impact,
    news_impact: dashboard.news_impact,
  };
}

module.exports = {
  CONFIDENCE_BUCKETS,
  EVALUATION_HORIZONS,
  buildConfidenceGroups,
  buildDiagnostics,
  calculateBrierScore,
  calculateEvaluation,
  evaluateValidationSignals,
  getConfidenceBucket,
  getConfidenceValidation,
  getOpenAiImpactValidation,
  getRegimeValidation,
  getReliability,
  getSectorValidation,
  getValidationDashboard,
  persistValidationSignalsFromScanResults,
  runValidationEvaluationJob,
};
