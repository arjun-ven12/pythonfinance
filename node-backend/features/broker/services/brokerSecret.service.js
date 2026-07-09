const { normalizeBrokerProvider } = require("./brokerAdapterRegistry.service");
const {
  decryptSecret,
  encryptSecret,
} = require("../../../services/encryptionService");
const { redactSensitive } = require("../../../services/redactionService");

function createBrokerSecretService({ prisma }) {
  function isMissingBrokerSecretTable(error) {
    const message = String(error?.message || "");
    return (
      error?.code === "P2021" &&
      (message.includes("BrokerSecret") || message.includes("public.BrokerSecret"))
    );
  }

  async function withBrokerSecretTable(operation, fallback) {
    try {
      return await operation();
    } catch (error) {
      if (!isMissingBrokerSecretTable(error)) {
        throw error;
      }
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
  }

  function contextFor(userId, provider) {
    return {
      scope: "broker_secret",
      userId,
      provider: normalizeBrokerProvider(provider),
    };
  }

  async function upsertBrokerSecret(userId, provider, secretPayload = null) {
    const normalizedProvider = normalizeBrokerProvider(provider);
    if (!secretPayload || Object.keys(secretPayload).length === 0) {
      return deleteBrokerSecret(userId, normalizedProvider);
    }

    const ciphertext = encryptSecret(
      JSON.stringify(secretPayload),
      contextFor(userId, normalizedProvider)
    );
    const keyVersion = String(ciphertext).split(":")[1] || null;

    await withBrokerSecretTable(
      () =>
        prisma.run((db) =>
          db.brokerSecret.upsert({
            where: {
              userId_provider: {
                userId,
                provider: normalizedProvider,
              },
            },
            update: {
              encryptedPayload: ciphertext,
              keyVersion,
            },
            create: {
              userId,
              provider: normalizedProvider,
              encryptedPayload: ciphertext,
              keyVersion,
            },
          })
        ),
      () => {
        const error = new Error(
          "Broker secret storage is not available until the BrokerSecret migration is applied."
        );
        error.statusCode = 503;
        throw error;
      }
    );

    return getBrokerSecretStatus(userId, normalizedProvider);
  }

  async function getBrokerSecret(userId, provider) {
    const normalizedProvider = normalizeBrokerProvider(provider);
    const record = await withBrokerSecretTable(
      () =>
        prisma.run((db) =>
          db.brokerSecret.findUnique({
            where: {
              userId_provider: {
                userId,
                provider: normalizedProvider,
              },
            },
          })
        ),
      null
    );

    if (!record) return null;

    return JSON.parse(
      decryptSecret(record.encryptedPayload, contextFor(userId, normalizedProvider))
    );
  }

  async function deleteBrokerSecret(userId, provider) {
    const normalizedProvider = normalizeBrokerProvider(provider);
    await withBrokerSecretTable(
      () =>
        prisma.run((db) =>
          db.brokerSecret.deleteMany({
            where: {
              userId,
              provider: normalizedProvider,
            },
          })
        ),
      null
    );
    return {
      configured: false,
      provider: normalizedProvider,
      lastUpdatedAt: null,
      keyVersion: null,
      storageReady: true,
    };
  }

  async function getBrokerSecretStatus(userId, provider) {
    const normalizedProvider = normalizeBrokerProvider(provider);
    const record = await withBrokerSecretTable(
      () =>
        prisma.run((db) =>
          db.brokerSecret.findUnique({
            where: {
              userId_provider: {
                userId,
                provider: normalizedProvider,
              },
            },
          })
        ),
      () => "__BROKER_SECRET_TABLE_MISSING__"
    );

    if (record === "__BROKER_SECRET_TABLE_MISSING__") {
      return {
        configured: false,
        provider: normalizedProvider,
        lastUpdatedAt: null,
        keyVersion: null,
        storageReady: false,
      };
    }

    return {
      configured: Boolean(record),
      provider: normalizedProvider,
      lastUpdatedAt: record?.updatedAt || null,
      keyVersion: record?.keyVersion || null,
      storageReady: true,
    };
  }

  function redactSecretPayload(payload) {
    return redactSensitive(payload || {});
  }

  return {
    deleteBrokerSecret,
    getBrokerSecret,
    getBrokerSecretStatus,
    redactSecretPayload,
    upsertBrokerSecret,
  };
}

module.exports = {
  createBrokerSecretService,
};
