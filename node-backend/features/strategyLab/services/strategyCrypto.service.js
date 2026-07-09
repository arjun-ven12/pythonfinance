const crypto = require("node:crypto");

const STRATEGY_CRYPTO_ALGORITHM = "aes-256-gcm";
const STRATEGY_CRYPTO_VERSION = "strategy-aes-256-gcm:v1";
const TEST_FALLBACK_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function createStrategyCryptoError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function parseMasterKey(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw createStrategyCryptoError(
      "STRATEGY_MASTER_KEY must decode to exactly 32 bytes of base64 data.",
      "STRATEGY_CRYPTO_CONFIG_ERROR"
    );
  }

  return key;
}

function parseAppEncryptionKey(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(":");
  const encodedKey = separatorIndex > 0 ? value.slice(separatorIndex + 1).trim() : value;
  return parseMasterKey(encodedKey);
}

function loadMasterKey() {
  const configured = parseMasterKey(process.env.STRATEGY_MASTER_KEY);
  if (configured) {
    return configured;
  }

  const appEncryptionKey = parseAppEncryptionKey(
    process.env.APP_ENCRYPTION_KEY_CURRENT
  );
  if (appEncryptionKey) {
    return appEncryptionKey;
  }

  if (process.env.NODE_ENV === "test") {
    return parseMasterKey(TEST_FALLBACK_MASTER_KEY);
  }

  throw createStrategyCryptoError(
    "STRATEGY_MASTER_KEY is required for encrypted strategy storage unless APP_ENCRYPTION_KEY_CURRENT provides a valid 32-byte master key.",
    "STRATEGY_CRYPTO_CONFIG_ERROR"
  );
}

function normalizeContext(context = {}) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(context || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .sort(([left], [right]) => left.localeCompare(right))
    )
  );
}

function getAssociatedData(context = {}) {
  return Buffer.from(normalizeContext(context), "utf8");
}

function encryptWithKey(key, plaintextBuffer, context = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(STRATEGY_CRYPTO_ALGORITHM, key, iv);
  cipher.setAAD(getAssociatedData(context));
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();
  return {
    ciphertext,
    iv,
    authenticationTag,
  };
}

function decryptWithKey(key, encrypted, context = {}) {
  const decipher = crypto.createDecipheriv(
    STRATEGY_CRYPTO_ALGORITHM,
    key,
    Buffer.from(String(encrypted.iv || ""), "base64url")
  );
  decipher.setAAD(getAssociatedData(context));
  decipher.setAuthTag(Buffer.from(String(encrypted.authenticationTag || ""), "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(String(encrypted.ciphertext || ""), "base64url")),
    decipher.final(),
  ]);
}

function createStrategyCryptoService() {
  function validateConfiguration() {
    return loadMasterKey();
  }

  function encryptStrategy(payload, context = {}) {
    if (payload === undefined) {
      throw createStrategyCryptoError(
        "Strategy payload is required for encryption.",
        "STRATEGY_CRYPTO_PAYLOAD_ERROR"
      );
    }

    const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
    const strategyEncryptionKey = crypto.randomBytes(32);

    const encryptedPayload = encryptWithKey(strategyEncryptionKey, payloadBuffer, context);
    const encryptedKey = encryptWithKey(
      loadMasterKey(),
      strategyEncryptionKey,
      { ...context, scope: `${context.scope || "strategy"}:keywrap` }
    );

    return {
      encryptedStrategy: encryptedPayload.ciphertext.toString("base64url"),
      encryptedStrategyKey: encryptedKey.ciphertext.toString("base64url"),
      iv: encryptedPayload.iv.toString("base64url"),
      authenticationTag: encryptedPayload.authenticationTag.toString("base64url"),
      keyIv: encryptedKey.iv.toString("base64url"),
      keyAuthenticationTag: encryptedKey.authenticationTag.toString("base64url"),
      algorithmVersion: STRATEGY_CRYPTO_VERSION,
    };
  }

  function decryptStrategy(encrypted, context = {}) {
    if (!encrypted) {
      throw createStrategyCryptoError(
        "Encrypted strategy payload is required.",
        "STRATEGY_CRYPTO_PAYLOAD_ERROR"
      );
    }

    const missingField = [
      "encryptedStrategy",
      "encryptedStrategyKey",
      "iv",
      "authenticationTag",
      "keyIv",
      "keyAuthenticationTag",
    ].find((field) => !encrypted[field]);
    if (missingField) {
      throw createStrategyCryptoError(
        `Missing encrypted strategy field: ${missingField}.`,
        "STRATEGY_CRYPTO_MISSING_FIELD"
      );
    }

    if (
      encrypted.algorithmVersion &&
      encrypted.algorithmVersion !== STRATEGY_CRYPTO_VERSION
    ) {
      throw createStrategyCryptoError(
        `Unsupported strategy encryption version: ${encrypted.algorithmVersion}.`,
        "STRATEGY_CRYPTO_VERSION_ERROR"
      );
    }

    try {
      const strategyEncryptionKey = decryptWithKey(
        loadMasterKey(),
        {
          ciphertext: encrypted.encryptedStrategyKey,
          iv: encrypted.keyIv,
          authenticationTag: encrypted.keyAuthenticationTag,
        },
        { ...context, scope: `${context.scope || "strategy"}:keywrap` }
      );

      const decryptedPayload = decryptWithKey(
        strategyEncryptionKey,
        {
          ciphertext: encrypted.encryptedStrategy,
          iv: encrypted.iv,
          authenticationTag: encrypted.authenticationTag,
        },
        context
      );

      return JSON.parse(decryptedPayload.toString("utf8"));
    } catch (error) {
      if (error?.code === "STRATEGY_CRYPTO_CONFIG_ERROR") {
        throw error;
      }

      throw createStrategyCryptoError(
        "Encrypted strategy payload failed integrity validation.",
        "STRATEGY_CRYPTO_INTEGRITY_ERROR",
        error
      );
    }
  }

  function rotateKeys(payload, context = {}) {
    return encryptStrategy(payload, context);
  }

  function validateIntegrity(encrypted, context = {}) {
    decryptStrategy(encrypted, context);
    return true;
  }

  return {
    STRATEGY_CRYPTO_ALGORITHM,
    STRATEGY_CRYPTO_VERSION,
    decryptStrategy,
    encryptStrategy,
    rotateKeys,
    validateConfiguration,
    validateIntegrity,
  };
}

module.exports = {
  STRATEGY_CRYPTO_ALGORITHM,
  STRATEGY_CRYPTO_VERSION,
  createStrategyCryptoError,
  createStrategyCryptoService,
};
