const path = require("path");

const strategyJsonContract = require(path.join(
  __dirname,
  "../../../../shared/strategyJson.contract.json"
));

const LOGICAL_OPERATORS = new Set(strategyJsonContract.allowed.logicalOperators);
const ALLOWED_INDICATORS = new Set(strategyJsonContract.allowed.indicators);
const ALLOWED_COMPARATORS = new Set(strategyJsonContract.allowed.comparators);
const ALLOWED_REGIMES = new Set(strategyJsonContract.allowed.regimes || []);
const ALLOWED_INSTRUMENT_TYPES = new Set(strategyJsonContract.allowed.instrumentTypes || []);
const TOP_LEVEL_KEYS = new Set(["schemaVersion", "metadata", "executable", "research", "evidence"]);
const EXECUTABLE_KEYS = new Set(strategyJsonContract.requiredExecutableFields.concat(["allocationMatrix"]));
const RULE_OBJECT_KEYS = new Set(["operator", "children", "indicator", "comparator", "value", "raw"]);
const INDICATOR_VALUE_KEYS = new Set(["kind", "indicator"]);

function normalizeNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function validateRuleNode(node, path = "rule") {
  if (!node || typeof node !== "object") {
    throw new Error(`${path} must be an object.`);
  }

  Object.keys(node).forEach((key) => {
    if (!RULE_OBJECT_KEYS.has(key)) {
      throw new Error(`${path}.${key} is unsupported.`);
    }
  });

  if (node.operator && LOGICAL_OPERATORS.has(String(node.operator).toUpperCase())) {
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) {
      throw new Error(`${path}.${node.operator} must include child rules.`);
    }
    children.forEach((child, index) => validateRuleNode(child, `${path}.children[${index}]`));
    return;
  }

  const indicator = String(node.indicator || "").toUpperCase();
  const comparator = String(node.comparator || "").toUpperCase();
  if (!ALLOWED_INDICATORS.has(indicator)) {
    throw new Error(`${path}.indicator is unsupported: ${indicator || "missing"}.`);
  }
  if (!ALLOWED_COMPARATORS.has(comparator)) {
    throw new Error(`${path}.comparator is unsupported: ${comparator || "missing"}.`);
  }

  const value = node.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("kind" in value || "indicator" in value) {
      Object.keys(value).forEach((key) => {
        if (!INDICATOR_VALUE_KEYS.has(key)) {
          throw new Error(`${path}.value.${key} is unsupported.`);
        }
      });
      if (value.kind !== "indicator") {
        throw new Error(`${path}.value.kind is unsupported: ${value.kind}.`);
      }
      const rhsIndicator = String(value.indicator || "").toUpperCase();
      if (!ALLOWED_INDICATORS.has(rhsIndicator)) {
        throw new Error(`${path}.value.indicator is unsupported: ${rhsIndicator || "missing"}.`);
      }
    }
  }
}

function validateStrategyDsl(strategyJson = {}) {
  Object.keys(strategyJson || {}).forEach((key) => {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`strategyJson.${key} is unsupported.`);
    }
  });

  if (strategyJson.schemaVersion && strategyJson.schemaVersion !== strategyJsonContract.schemaVersion) {
    throw new Error(`Unsupported strategyJson schemaVersion: ${strategyJson.schemaVersion}.`);
  }

  const executable = strategyJson.executable || {};
  Object.keys(executable).forEach((key) => {
    if (!EXECUTABLE_KEYS.has(key)) {
      throw new Error(`strategyJson.executable.${key} is unsupported.`);
    }
  });
  for (const field of strategyJsonContract.requiredExecutableFields) {
    if (executable[field] === undefined) {
      throw new Error(`strategyJson.executable.${field} is required by ${strategyJsonContract.schemaVersion}.`);
    }
  }

  const entryRules = Array.isArray(executable.entryRules) ? executable.entryRules : [];
  const exitRules = Array.isArray(executable.exitRules) ? executable.exitRules : [];
  const riskRules = Array.isArray(executable.riskRules) ? executable.riskRules : [];

  if (entryRules.length === 0) {
    throw new Error("Strategy DSL requires at least one entry rule.");
  }

  [...entryRules, ...exitRules, ...riskRules].forEach((rule, index) =>
    validateRuleNode(rule, `executable.rules[${index}]`)
  );

  const envelope = executable.envelope || {};
  const allowedRegimes = Array.isArray(envelope.regimes) ? envelope.regimes : [];
  const allowedInstrumentTypes = Array.isArray(envelope.instrumentTypes)
    ? envelope.instrumentTypes
    : [];

  allowedRegimes.forEach((regime, index) => {
    const normalized = String(regime || "").trim().toUpperCase();
    if (normalized && !ALLOWED_REGIMES.has(normalized)) {
      throw new Error(`strategyJson.executable.envelope.regimes[${index}] is unsupported: ${regime}.`);
    }
  });

  allowedInstrumentTypes.forEach((instrumentType, index) => {
    const normalized = String(instrumentType || "").trim().toUpperCase();
    if (normalized && !ALLOWED_INSTRUMENT_TYPES.has(normalized)) {
      throw new Error(
        `strategyJson.executable.envelope.instrumentTypes[${index}] is unsupported: ${instrumentType}.`
      );
    }
  });

  const overlays = executable.regimeOverlays || {};
  Object.keys(overlays).forEach((regimeLabel) => {
    const normalized = String(regimeLabel || "").trim().toUpperCase();
    if (normalized && !ALLOWED_REGIMES.has(normalized)) {
      throw new Error(`strategyJson.executable.regimeOverlays.${regimeLabel} is unsupported.`);
    }
  });

  const validation = executable.validation || {};
  return {
    isValid: true,
    schemaVersion: strategyJsonContract.schemaVersion,
    warnings: [
      normalizeNumber(validation.minimumTrades, 30, { min: 0 }) < 30
        ? "Minimum trades below 30 reduces evidence quality."
        : null,
      normalizeNumber(validation.maxDrawdown, 25, { min: 0 }) > 25
        ? "Max drawdown threshold is loose for deployment."
        : null,
      ...(strategyJson.metadata?.designNotes || []).map(
        (note) => `${note.field}: ${note.label}`
      ),
    ].filter(Boolean),
  };
}

module.exports = {
  strategyJsonContract,
  validateStrategyDsl,
};
