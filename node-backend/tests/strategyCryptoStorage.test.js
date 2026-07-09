const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createStrategyCryptoService,
} = require("../features/strategyLab/services/strategyCrypto.service");
const {
  createStrategyStorageService,
} = require("../features/strategyLab/services/strategyStorage.service");

function withMasterKey(fn) {
  const previous = process.env.STRATEGY_MASTER_KEY;
  process.env.STRATEGY_MASTER_KEY =
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.STRATEGY_MASTER_KEY;
    } else {
      process.env.STRATEGY_MASTER_KEY = previous;
    }
  }
}

test("strategy crypto round-trips encrypted payloads", () =>
  withMasterKey(() => {
    const cryptoService = createStrategyCryptoService();
    const payload = {
      strategyJson: {
        executable: {
          entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
        },
      },
      riskPerTrade: 0.01,
    };

    const encrypted = cryptoService.encryptStrategy(payload, {
      scope: "strategy-version",
      userId: "user-1",
      experimentId: "exp-1",
    });
    const decrypted = cryptoService.decryptStrategy(encrypted, {
      scope: "strategy-version",
      userId: "user-1",
      experimentId: "exp-1",
    });

    assert.deepEqual(decrypted, payload);
  }));

test("strategy crypto fails authentication after tampering", () =>
  withMasterKey(() => {
    const cryptoService = createStrategyCryptoService();
    const encrypted = cryptoService.encryptStrategy(
      { secret: "alpha" },
      { scope: "strategy-experiment", userId: "user-1", experimentId: "exp-1" }
    );

    const tampered = {
      ...encrypted,
      encryptedStrategy: encrypted.encryptedStrategy.slice(0, -2) + "ab",
    };

    assert.throws(
      () =>
        cryptoService.decryptStrategy(tampered, {
          scope: "strategy-experiment",
          userId: "user-1",
          experimentId: "exp-1",
        }),
      /integrity/i
    );
  }));

test("strategy storage keeps metadata readable while removing plaintext logic from persisted fields", () =>
  withMasterKey(() => {
    const storage = createStrategyStorageService();
    const persisted = storage.encryptExperimentForStorage({
      id: "exp-1",
      userId: "user-1",
      name: "Momentum Lab",
      settingsJson: {
        template: "Momentum",
        marketBias: "US",
        riskPerTrade: 0.01,
        strategyPrompt: "Low drawdown trend strategy",
        strategyJson: {
          executable: {
            entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
            positionSizing: { method: "risk_per_trade", riskPerTrade: 0.01 },
          },
        },
      },
    });

    assert.equal(persisted.settingsJson.template, "Momentum");
    assert.equal(persisted.settingsJson.marketBias, "US");
    assert.equal(persisted.settingsJson.riskPerTrade, undefined);
    assert.match(persisted.encryptedStrategy, /^[A-Za-z0-9\-_]+$/);

    const serialized = JSON.stringify(persisted);
    assert.doesNotMatch(serialized, /EMA_FAST/);
    assert.doesNotMatch(serialized, /risk_per_trade/);
    assert.doesNotMatch(serialized, /Low drawdown trend strategy/);

    const hydrated = storage.hydrateStrategyExperimentRecord(persisted);
    assert.equal(hydrated.settingsJson.riskPerTrade, 0.01);
    assert.equal(
      hydrated.settingsJson.strategyJson.executable.entryRules[0].indicator,
      "EMA_FAST"
    );
  }));

test("strategy storage can hydrate experiments created before a database id existed", () =>
  withMasterKey(() => {
    const cryptoService = createStrategyCryptoService();
    const storage = createStrategyStorageService({ strategyCrypto: cryptoService });
    const payload = {
      settingsJson: {
        template: "Momentum",
        riskPerTrade: 0.01,
        strategyJson: {
          executable: {
            entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
          },
        },
      },
      generatedJson: null,
      executionRules: null,
      entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
      exitRules: [],
      riskConfiguration: {
        riskRules: [],
        validation: null,
        filters: null,
      },
      sizingConfiguration: null,
      aiGeneratedStrategyPayload: {
        strategyPrompt: "",
        research: null,
      },
      futureAlgorithmPayloads: {
        code: null,
        algorithm: null,
      },
    };
    const encrypted = cryptoService.encryptStrategy(payload, {
      scope: "strategy-experiment",
      userId: "user-1",
    });

    const hydrated = storage.hydrateStrategyExperimentRecord({
      id: "exp-created-later",
      userId: "user-1",
      name: "Created First",
      settingsJson: { template: "Momentum" },
      encryptedStrategy: encrypted.encryptedStrategy,
      encryptedStrategyKey: encrypted.encryptedStrategyKey,
      strategyEncryptionIv: encrypted.iv,
      strategyEncryptionTag: encrypted.authenticationTag,
      strategyEncryptionKeyIv: encrypted.keyIv,
      strategyEncryptionKeyTag: encrypted.keyAuthenticationTag,
      strategyEncryptionAlgorithmVersion: encrypted.algorithmVersion,
    });

    assert.equal(hydrated.settingsJson.riskPerTrade, 0.01);
    assert.equal(
      hydrated.settingsJson.strategyJson.executable.entryRules[0].indicator,
      "EMA_FAST"
    );
  }));

test("strategy storage can hydrate versions created before a version id existed", () =>
  withMasterKey(() => {
    const cryptoService = createStrategyCryptoService();
    const storage = createStrategyStorageService({ strategyCrypto: cryptoService });
    const payload = {
      settingsJson: {
        template: "Momentum",
        riskPerTrade: 0.01,
        strategyJson: {
          executable: {
            entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
          },
        },
      },
      strategyJson: {
        executable: {
          entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
        },
      },
      generatedJson: {
        executable: {
          entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
        },
      },
      executionRules: null,
      entryRules: [{ indicator: "EMA_FAST", comparator: ">", value: "EMA_SLOW" }],
      exitRules: [],
      riskConfiguration: {
        riskRules: [],
        validation: null,
        filters: null,
      },
      sizingConfiguration: null,
      aiGeneratedStrategyPayload: {
        strategyPrompt: "",
        research: null,
      },
      futureAlgorithmPayloads: {
        code: null,
        algorithm: null,
      },
    };
    const encrypted = cryptoService.encryptStrategy(payload, {
      scope: "strategy-version",
      userId: "user-1",
      experimentId: "exp-1",
    });

    const hydrated = storage.hydrateStrategyVersionRecord({
      id: "version-created-later",
      userId: "user-1",
      experimentId: "exp-1",
      version: 1,
      settingsJson: { template: "Momentum" },
      encryptedStrategy: encrypted.encryptedStrategy,
      encryptedStrategyKey: encrypted.encryptedStrategyKey,
      strategyEncryptionIv: encrypted.iv,
      strategyEncryptionTag: encrypted.authenticationTag,
      strategyEncryptionKeyIv: encrypted.keyIv,
      strategyEncryptionKeyTag: encrypted.keyAuthenticationTag,
      strategyEncryptionAlgorithmVersion: encrypted.algorithmVersion,
    });

    assert.equal(hydrated.settingsJson.riskPerTrade, 0.01);
    assert.equal(hydrated.strategyJson.executable.entryRules[0].indicator, "EMA_FAST");
  }));

test("invalid strategy master key configuration returns a meaningful error", () => {
  const previous = process.env.STRATEGY_MASTER_KEY;
  const previousAppKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  process.env.STRATEGY_MASTER_KEY = "invalid-key";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;
  try {
    const cryptoService = createStrategyCryptoService();
    assert.throws(
      () => cryptoService.validateConfiguration(),
      /STRATEGY_MASTER_KEY must decode to exactly 32 bytes/
    );
  } finally {
    if (previous === undefined) {
      delete process.env.STRATEGY_MASTER_KEY;
    } else {
      process.env.STRATEGY_MASTER_KEY = previous;
    }

    if (previousAppKey === undefined) {
      delete process.env.APP_ENCRYPTION_KEY_CURRENT;
    } else {
      process.env.APP_ENCRYPTION_KEY_CURRENT = previousAppKey;
    }
  }
});

test("strategy crypto falls back to APP_ENCRYPTION_KEY_CURRENT when STRATEGY_MASTER_KEY is missing", () => {
  const previousStrategyKey = process.env.STRATEGY_MASTER_KEY;
  const previousAppKey = process.env.APP_ENCRYPTION_KEY_CURRENT;
  delete process.env.STRATEGY_MASTER_KEY;
  process.env.APP_ENCRYPTION_KEY_CURRENT =
    "current:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

  try {
    const cryptoService = createStrategyCryptoService();
    const encrypted = cryptoService.encryptStrategy(
      { strategyName: "Fallback strategy" },
      { scope: "strategy-experiment", userId: "user-1", experimentId: "exp-1" }
    );

    const decrypted = cryptoService.decryptStrategy(encrypted, {
      scope: "strategy-experiment",
      userId: "user-1",
      experimentId: "exp-1",
    });

    assert.equal(decrypted.strategyName, "Fallback strategy");
  } finally {
    if (previousStrategyKey === undefined) {
      delete process.env.STRATEGY_MASTER_KEY;
    } else {
      process.env.STRATEGY_MASTER_KEY = previousStrategyKey;
    }

    if (previousAppKey === undefined) {
      delete process.env.APP_ENCRYPTION_KEY_CURRENT;
    } else {
      process.env.APP_ENCRYPTION_KEY_CURRENT = previousAppKey;
    }
  }
});
