const {
  createStrategyCryptoService,
} = require("./strategyCrypto.service");

const PLAINTEXT_STRATEGY_METADATA_KEYS = new Set([
  "template",
  "objective",
  "universeType",
  "marketBias",
  "primaryTimeframe",
  "entryTimeframe",
  "universeId",
  "universeName",
  "deploymentReadiness",
  "robustness",
  "activationRules",
]);

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function mergeDefined(target = {}, source = {}) {
  const merged = { ...(target || {}) };
  for (const [key, value] of Object.entries(source || {})) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function extractStrategyMetadata(settings = {}) {
  const metadata = {};
  for (const [key, value] of Object.entries(settings || {})) {
    if (!PLAINTEXT_STRATEGY_METADATA_KEYS.has(key)) {
      continue;
    }
    if (value !== undefined) {
      metadata[key] = deepClone(value);
    }
  }
  return metadata;
}

function buildExperimentPayload(settingsJson = {}) {
  const strategyJson = settingsJson?.strategyJson || null;
  return {
    settingsJson: deepClone(settingsJson),
    generatedJson: deepClone(strategyJson),
    executionRules: deepClone(strategyJson?.executable?.execution || null),
    entryRules: deepClone(strategyJson?.executable?.entryRules || []),
    exitRules: deepClone(strategyJson?.executable?.exitRules || []),
    riskConfiguration: deepClone({
      riskRules: strategyJson?.executable?.riskRules || [],
      validation: strategyJson?.executable?.validation || null,
      filters: strategyJson?.executable?.filters || null,
    }),
    sizingConfiguration: deepClone(strategyJson?.executable?.positionSizing || null),
    aiGeneratedStrategyPayload: deepClone({
      strategyPrompt: settingsJson?.strategyPrompt || "",
      research: strategyJson?.research || null,
    }),
    futureAlgorithmPayloads: deepClone({
      code: settingsJson?.codePayload || null,
      algorithm: settingsJson?.algorithmPayload || null,
    }),
  };
}

function buildVersionPayload({ settingsJson = {}, strategyJson = null }) {
  const effectiveStrategyJson = strategyJson || settingsJson?.strategyJson || null;
  return {
    settingsJson: deepClone(settingsJson),
    strategyJson: deepClone(effectiveStrategyJson),
    generatedJson: deepClone(effectiveStrategyJson),
    executionRules: deepClone(effectiveStrategyJson?.executable?.execution || null),
    entryRules: deepClone(effectiveStrategyJson?.executable?.entryRules || []),
    exitRules: deepClone(effectiveStrategyJson?.executable?.exitRules || []),
    riskConfiguration: deepClone({
      riskRules: effectiveStrategyJson?.executable?.riskRules || [],
      validation: effectiveStrategyJson?.executable?.validation || null,
      filters: effectiveStrategyJson?.executable?.filters || null,
    }),
    sizingConfiguration: deepClone(effectiveStrategyJson?.executable?.positionSizing || null),
    aiGeneratedStrategyPayload: deepClone({
      strategyPrompt: settingsJson?.strategyPrompt || "",
      research: effectiveStrategyJson?.research || null,
    }),
    futureAlgorithmPayloads: deepClone({
      code: settingsJson?.codePayload || null,
      algorithm: settingsJson?.algorithmPayload || null,
    }),
  };
}

function hasEncryptedPayload(record = {}) {
  return Boolean(
    record?.encryptedStrategy ||
      record?.encryptedStrategyKey ||
      record?.strategyEncryptionIv ||
      record?.strategyEncryptionTag ||
      record?.strategyEncryptionKeyIv ||
      record?.strategyEncryptionKeyTag
  );
}

function encryptionFieldsFromEnvelope(envelope) {
  return {
    encryptedStrategy: envelope.encryptedStrategy,
    encryptedStrategyKey: envelope.encryptedStrategyKey,
    strategyEncryptionIv: envelope.iv,
    strategyEncryptionTag: envelope.authenticationTag,
    strategyEncryptionKeyIv: envelope.keyIv,
    strategyEncryptionKeyTag: envelope.keyAuthenticationTag,
    strategyEncryptionAlgorithmVersion: envelope.algorithmVersion,
  };
}

function envelopeFromRecord(record = {}) {
  return {
    encryptedStrategy: record.encryptedStrategy,
    encryptedStrategyKey: record.encryptedStrategyKey,
    iv: record.strategyEncryptionIv,
    authenticationTag: record.strategyEncryptionTag,
    keyIv: record.strategyEncryptionKeyIv,
    keyAuthenticationTag: record.strategyEncryptionKeyTag,
    algorithmVersion: record.strategyEncryptionAlgorithmVersion,
  };
}

let defaultStrategyStorageService = null;

function createStrategyStorageService({
  strategyCrypto = createStrategyCryptoService(),
} = {}) {
  function encryptionContextFor(type, record = {}) {
    if (type === "strategy-version") {
      return {
        scope: type,
        userId: record.userId || null,
        experimentId: record.experimentId || record.id || null,
      };
    }

    return {
      scope: type,
      userId: record.userId || null,
    };
  }

  function decryptionContextsFor(type, record = {}) {
    if (type === "strategy-version") {
      return [
        {
          scope: type,
          userId: record.userId || null,
          experimentId: record.experimentId || record.id || null,
        },
        {
          scope: type,
          userId: record.userId || null,
          experimentId: record.experimentId || record.id || null,
          strategyVersionId: record.id || null,
        },
      ];
    }

    return [
      {
        scope: type,
        userId: record.userId || null,
        experimentId: record.id || null,
      },
      {
        scope: type,
        userId: record.userId || null,
      },
    ];
  }

  function decryptWithCompatibleContexts(envelope, type, record = {}) {
    const contexts = decryptionContextsFor(type, record);
    let lastError = null;

    for (const context of contexts) {
      try {
        return strategyCrypto.decryptStrategy(envelope, context);
      } catch (error) {
        if (error?.code === "STRATEGY_CRYPTO_CONFIG_ERROR") {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  function validateWithCompatibleContexts(envelope, type, record = {}) {
    const contexts = decryptionContextsFor(type, record);
    let lastError = null;

    for (const context of contexts) {
      try {
        strategyCrypto.validateIntegrity(envelope, context);
        return true;
      } catch (error) {
        if (error?.code === "STRATEGY_CRYPTO_CONFIG_ERROR") {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  function encryptExperimentForStorage(record = {}) {
    const settingsJson = deepClone(record.settingsJson || {});
    const envelope = strategyCrypto.encryptStrategy(
      buildExperimentPayload(settingsJson),
      encryptionContextFor("strategy-experiment", record)
    );

    return {
      ...record,
      settingsJson: extractStrategyMetadata(settingsJson),
      ...encryptionFieldsFromEnvelope(envelope),
    };
  }

  function encryptVersionForStorage(record = {}) {
    const settingsJson = deepClone(record.settingsJson || {});
    const strategyJson = deepClone(record.strategyJson || settingsJson?.strategyJson || null);
    const envelope = strategyCrypto.encryptStrategy(
      buildVersionPayload({ settingsJson, strategyJson }),
      encryptionContextFor("strategy-version", record)
    );

    return {
      ...record,
      strategyJson: null,
      settingsJson: extractStrategyMetadata(settingsJson),
      ...encryptionFieldsFromEnvelope(envelope),
    };
  }

  function hydrateStrategyExperimentRecord(record) {
    if (!record) {
      return record;
    }

    const nextRecord = { ...record };
    if (Array.isArray(nextRecord.versions)) {
      nextRecord.versions = nextRecord.versions.map(hydrateStrategyVersionRecord);
    }

    if (!hasEncryptedPayload(nextRecord)) {
      return nextRecord;
    }

    const decrypted = decryptWithCompatibleContexts(
      envelopeFromRecord(nextRecord),
      "strategy-experiment",
      nextRecord
    );

    nextRecord.settingsJson = mergeDefined(
      nextRecord.settingsJson || {},
      deepClone(decrypted?.settingsJson || {})
    );
    return nextRecord;
  }

  function hydrateStrategyVersionRecord(record) {
    if (!record) {
      return record;
    }

    const nextRecord = { ...record };
    if (nextRecord.experiment) {
      nextRecord.experiment = hydrateStrategyExperimentRecord(nextRecord.experiment);
    }

    if (!hasEncryptedPayload(nextRecord)) {
      return nextRecord;
    }

    const decrypted = decryptWithCompatibleContexts(
      envelopeFromRecord(nextRecord),
      "strategy-version",
      nextRecord
    );

    nextRecord.settingsJson = mergeDefined(
      nextRecord.settingsJson || {},
      deepClone(decrypted?.settingsJson || {})
    );
    nextRecord.strategyJson = deepClone(
      decrypted?.strategyJson || decrypted?.generatedJson || null
    );
    return nextRecord;
  }

  function validateStrategyRecordIntegrity(record, type = "strategy-experiment") {
    if (!record || !hasEncryptedPayload(record)) {
      return true;
    }

    return validateWithCompatibleContexts(
      envelopeFromRecord(record),
      type,
      record
    );
  }

  return {
    encryptExperimentForStorage,
    encryptVersionForStorage,
    extractStrategyMetadata,
    hydrateStrategyExperimentRecord,
    hydrateStrategyVersionRecord,
    validateStrategyRecordIntegrity,
  };
}

function getDefaultStrategyStorageService() {
  if (!defaultStrategyStorageService) {
    defaultStrategyStorageService = createStrategyStorageService();
  }
  return defaultStrategyStorageService;
}

module.exports = {
  PLAINTEXT_STRATEGY_METADATA_KEYS,
  createStrategyStorageService,
  extractStrategyMetadata,
  getDefaultStrategyStorageService,
};
