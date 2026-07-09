const crypto = require("node:crypto");

const ENCRYPTION_FORMAT_VERSION = "v1";
const TEST_FALLBACK_KEY =
  "test:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function createConfigurationError(message) {
  const error = new Error(message);
  error.code = "ENCRYPTION_CONFIG_ERROR";
  return error;
}

function parseKeyDefinition(rawValue, fallbackId) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(":");
  const hasEmbeddedId = separatorIndex > 0;
  const keyId = hasEmbeddedId ? value.slice(0, separatorIndex).trim() : fallbackId;
  const encodedKey = hasEmbeddedId ? value.slice(separatorIndex + 1).trim() : value;
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw createConfigurationError(
      `Encryption key "${keyId}" must decode to exactly 32 bytes of base64 data.`
    );
  }

  return {
    id: keyId,
    key,
  };
}

function loadConfiguredKeys() {
  const current = parseKeyDefinition(
    process.env.APP_ENCRYPTION_KEY_CURRENT,
    "current"
  );
  const previous = parseKeyDefinition(
    process.env.APP_ENCRYPTION_KEY_PREVIOUS,
    "previous"
  );

  if (!current) {
    if (process.env.NODE_ENV === "test") {
      const fallback = parseKeyDefinition(TEST_FALLBACK_KEY, "test");
      return {
        current: fallback,
        all: new Map([[fallback.id, fallback]]),
        usingTestFallback: true,
      };
    }

    throw createConfigurationError(
      "APP_ENCRYPTION_KEY_CURRENT is required whenever secret encryption is enabled."
    );
  }

  const all = new Map([[current.id, current]]);
  if (previous) {
    all.set(previous.id, previous);
  }

  return { current, all, usingTestFallback: false };
}

function normalizeContext(context = {}) {
  const entries = Object.entries(context || {}).filter(
    ([, value]) => value !== undefined
  );
  entries.sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

function getAssociatedData(context) {
  return Buffer.from(normalizeContext(context), "utf8");
}

function encryptSecret(plaintext, context = {}) {
  if (plaintext == null || plaintext === "") {
    return null;
  }

  const { current } = loadConfiguredKeys();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(getAssociatedData(context));
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_FORMAT_VERSION,
    current.id,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptSecret(ciphertext, context = {}) {
  if (ciphertext == null || ciphertext === "") {
    return null;
  }

  const value = String(ciphertext);
  if (!value.startsWith(`${ENCRYPTION_FORMAT_VERSION}:`)) {
    return value;
  }

  const [, keyId, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (!keyId || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Malformed encrypted secret.");
  }

  const { all } = loadConfiguredKeys();
  const selectedKey = all.get(keyId);
  if (!selectedKey) {
    throw new Error(`No encryption key configured for key id "${keyId}".`);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    selectedKey.key,
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAAD(getAssociatedData(context));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function maybeEncrypt(value, context = {}) {
  if (value == null || value === "") {
    return null;
  }

  return String(value).startsWith(`${ENCRYPTION_FORMAT_VERSION}:`)
    ? String(value)
    : encryptSecret(value, context);
}

function maybeDecrypt(value, context = {}) {
  if (value == null || value === "") {
    return null;
  }

  return decryptSecret(value, context);
}

function encryptionDiagnostics() {
  const previousConfigured = Boolean(process.env.APP_ENCRYPTION_KEY_PREVIOUS);

  try {
    const { current, usingTestFallback } = loadConfiguredKeys();
    return {
      configured: Boolean(current),
      failClosed: process.env.NODE_ENV !== "test",
      currentKeyId: current?.id || null,
      previousConfigured,
      mode: usingTestFallback ? "TEST_FALLBACK" : "ENABLED",
    };
  } catch (error) {
    return {
      configured: false,
      failClosed: true,
      currentKeyId: null,
      previousConfigured,
      mode: "INVALID",
      error: error.message,
    };
  }
}

function validateEncryptionConfiguration() {
  return loadConfiguredKeys();
}

module.exports = {
  ENCRYPTION_FORMAT_VERSION,
  decryptSecret,
  encryptSecret,
  encryptionDiagnostics,
  maybeDecrypt,
  maybeEncrypt,
  validateEncryptionConfiguration,
};
