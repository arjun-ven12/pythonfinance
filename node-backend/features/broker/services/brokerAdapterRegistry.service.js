const { assertBrokerAdapterContract } = require("../adapters/brokerAdapterContract");

function normalizeBrokerProvider(value, fallback = "MOOMOO") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return ["MOOMOO", "IBKR", "INTERNAL_PAPER"].includes(normalized)
    ? normalized
    : fallback;
}

function createBrokerAdapterRegistry({
  adapters,
  defaultProvider = process.env.DEFAULT_BROKER_PROVIDER || "MOOMOO",
  prisma,
}) {
  const normalizedDefaultProvider = normalizeBrokerProvider(defaultProvider, "MOOMOO");
  const registry = new Map();

  Object.entries(adapters || {}).forEach(([provider, adapter]) => {
    registry.set(
      normalizeBrokerProvider(provider, provider),
      assertBrokerAdapterContract(adapter, `${provider} adapter`)
    );
  });

  async function getProvider(userId) {
    if (!prisma || !userId) return normalizedDefaultProvider;
    const record = await prisma.run((db) =>
      db.brokerConfig.findUnique({
        where: { userId },
        select: { provider: true },
      })
    );
    return normalizeBrokerProvider(record?.provider, normalizedDefaultProvider);
  }

  async function getAdapter(userId, providerOverride = null) {
    const provider = providerOverride
      ? normalizeBrokerProvider(providerOverride, normalizedDefaultProvider)
      : await getProvider(userId);
    const adapter = registry.get(provider);
    if (!adapter) {
      throw new Error(`No broker adapter registered for provider ${provider}.`);
    }
    return adapter;
  }

  return {
    getAdapter,
    getProvider,
    normalizeBrokerProvider,
  };
}

module.exports = {
  createBrokerAdapterRegistry,
  normalizeBrokerProvider,
};
