const { redactSensitive } = require("../../../services/redactionService");

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function sanitizeAiInput(value) {
  const redacted = redactSensitive(value);
  const accountPattern = /(accountid|account_id|brokeraccountid|accountnumber|account_number)/i;

  if (Array.isArray(redacted)) {
    return redacted.map((entry) => sanitizeAiInput(entry));
  }

  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    return Object.fromEntries(
      Object.entries(redacted).map(([key, entryValue]) => [
        key,
        accountPattern.test(key) ? "[REDACTED]" : sanitizeAiInput(entryValue),
      ])
    );
  }

  return redacted;
}

function scrubStrategyRecord(record) {
  if (!record || typeof record !== "object") {
    return;
  }

  if ("settingsJson" in record) {
    record.settingsJson = null;
  }
  if ("strategyJson" in record) {
    record.strategyJson = null;
  }
  if ("versions" in record) {
    record.versions = null;
  }
  if ("experiment" in record) {
    record.experiment = null;
  }
}

function createStrategyContextBuilder({
  strategyStorage,
  recordType = "strategy-version",
  selectContext = (record) => record,
} = {}) {
  if (!strategyStorage) {
    throw new Error("strategyStorage is required for secure strategy context builders.");
  }

  const hydrate =
    recordType === "strategy-experiment"
      ? strategyStorage.hydrateStrategyExperimentRecord
      : strategyStorage.hydrateStrategyVersionRecord;

  return async ({ strategyRecord, ...rest } = {}) => {
    if (!strategyRecord) {
      throw new Error("strategyRecord is required for encrypted strategy AI context.");
    }

    const hydratedRecord = hydrate.call(strategyStorage, deepClone(strategyRecord));

    try {
      return selectContext(hydratedRecord, rest);
    } finally {
      scrubStrategyRecord(hydratedRecord);
    }
  };
}

function createContextRegistry({ builders = {} } = {}) {
  const registry = new Map(Object.entries(builders));

  return {
    has(name) {
      return registry.has(name);
    },

    register(name, builder) {
      registry.set(name, builder);
    },

    async build(nameOrBuilder, payload = {}) {
      if (typeof nameOrBuilder === "function") {
        return nameOrBuilder(payload);
      }

      if (nameOrBuilder == null) {
        return payload;
      }

      const builder = registry.get(nameOrBuilder);
      if (!builder) {
        throw new Error(`Unknown AI context builder: ${nameOrBuilder}.`);
      }
      return builder(payload);
    },
  };
}

module.exports = {
  createContextRegistry,
  createStrategyContextBuilder,
  sanitizeAiInput,
};
