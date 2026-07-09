const assert = require("node:assert/strict");
const test = require("node:test");

const {
  decryptSecret,
  encryptSecret,
  encryptionDiagnostics,
  maybeDecrypt,
  maybeEncrypt,
  validateEncryptionConfiguration,
} = require("../services/encryptionService");

const CURRENT_KEY =
  "current:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const PREVIOUS_KEY =
  "previous:ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=";

function withKeys(fn) {
  const previousCurrent = process.env.APP_ENCRYPTION_KEY_CURRENT;
  const previousPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;
  process.env.APP_ENCRYPTION_KEY_PREVIOUS = PREVIOUS_KEY;
  try {
    fn();
  } finally {
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousCurrent;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousPrevious;
  }
}

test("encrypt/decrypt round trip succeeds", () => {
  withKeys(() => {
    const ciphertext = encryptSecret("super-secret", {
      scope: "test",
      field: "token",
    });

    assert.notEqual(ciphertext, "super-secret");
    assert.ok(ciphertext.startsWith("v1:current:"));
    assert.equal(
      decryptSecret(ciphertext, { scope: "test", field: "token" }),
      "super-secret"
    );
  });
});

test("wrong context fails decryption", () => {
  withKeys(() => {
    const ciphertext = encryptSecret("super-secret", {
      scope: "test",
      field: "token",
    });

    assert.throws(
      () => decryptSecret(ciphertext, { scope: "other", field: "token" }),
      /Unsupported state|authenticate|unable/i
    );
  });
});

test("previous key can decrypt rotated ciphertext", () => {
  const previousCurrent = process.env.APP_ENCRYPTION_KEY_CURRENT;
  const previousPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;

  process.env.APP_ENCRYPTION_KEY_CURRENT = PREVIOUS_KEY;
  delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  const ciphertext = encryptSecret("rotated-secret", { scope: "rotation" });

  process.env.APP_ENCRYPTION_KEY_CURRENT = CURRENT_KEY;
  process.env.APP_ENCRYPTION_KEY_PREVIOUS = PREVIOUS_KEY;

  try {
    assert.equal(
      decryptSecret(ciphertext, { scope: "rotation" }),
      "rotated-secret"
    );
  } finally {
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousCurrent;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousPrevious;
  }
});

test("null values remain null for maybe helpers", () => {
  withKeys(() => {
    assert.equal(maybeEncrypt(null), null);
    assert.equal(maybeDecrypt(null), null);
  });
});

test("missing key in production throws", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousCurrent = process.env.APP_ENCRYPTION_KEY_CURRENT;
  const previousPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  process.env.NODE_ENV = "production";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;
  delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;

  try {
    assert.throws(() => validateEncryptionConfiguration(), /APP_ENCRYPTION_KEY_CURRENT/);
    assert.throws(() => encryptSecret("secret"), /APP_ENCRYPTION_KEY_CURRENT/);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousCurrent;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousPrevious;
  }
});

test("missing key in development throws", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousCurrent = process.env.APP_ENCRYPTION_KEY_CURRENT;
  const previousPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  process.env.NODE_ENV = "development";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;
  delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;

  try {
    assert.throws(() => validateEncryptionConfiguration(), /APP_ENCRYPTION_KEY_CURRENT/);
    assert.throws(() => maybeEncrypt("secret"), /APP_ENCRYPTION_KEY_CURRENT/);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousCurrent;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousPrevious;
  }
});

test("missing key in test uses explicit test fallback encryption", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousCurrent = process.env.APP_ENCRYPTION_KEY_CURRENT;
  const previousPrevious = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  process.env.NODE_ENV = "test";
  delete process.env.APP_ENCRYPTION_KEY_CURRENT;
  delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;

  try {
    const ciphertext = encryptSecret("secret", { scope: "test-only" });
    assert.ok(ciphertext.startsWith("v1:test:"));
    assert.notEqual(ciphertext, "secret");
    assert.equal(
      decryptSecret(ciphertext, { scope: "test-only" }),
      "secret"
    );
    assert.equal(encryptionDiagnostics().mode, "TEST_FALLBACK");
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    process.env.APP_ENCRYPTION_KEY_CURRENT = previousCurrent;
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = previousPrevious;
  }
});
