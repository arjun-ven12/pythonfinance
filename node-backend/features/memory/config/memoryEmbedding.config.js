const SUPPORTED_PROVIDERS = Object.freeze(["OPENAI"]);
const VECTOR_DIMENSIONS = 1536;

function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function buildMemoryEmbeddingConfig(env = process.env) {
  const provider = String(env.EMBEDDING_PROVIDER || "OPENAI").trim().toUpperCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported embedding provider: ${provider}.`);
  }

  if (env.EMBEDDING_DIMENSIONS !== undefined && !/^\d+$/.test(String(env.EMBEDDING_DIMENSIONS).trim())) {
    throw new Error("EMBEDDING_DIMENSIONS must be an integer.");
  }
  const dimensions = integer(env.EMBEDDING_DIMENSIONS, VECTOR_DIMENSIONS, {
    min: 1,
    max: 4096,
  });
  if (dimensions !== VECTOR_DIMENSIONS) {
    throw new Error(
      `EMBEDDING_DIMENSIONS must match the pgvector column (${VECTOR_DIMENSIONS}).`
    );
  }

  const model = String(env.EMBEDDING_MODEL || "text-embedding-3-small").trim();
  if (!model.startsWith("text-embedding-3-")) {
    throw new Error("EMBEDDING_MODEL must be a text-embedding-3 model.");
  }

  return Object.freeze({
    enabled: bool(env.MEMORY_EMBEDDING_ENABLED, false),
    provider,
    model,
    dimensions,
    embeddingVersion: String(env.MEMORY_EMBEDDING_VERSION || "1").trim(),
    documentBuilderVersion: String(env.MEMORY_DOCUMENT_BUILDER_VERSION || "1").trim(),
    batchSize: integer(env.MEMORY_EMBEDDING_BATCH_SIZE, 25, { min: 1, max: 100 }),
    maxConcurrency: integer(env.MEMORY_EMBEDDING_MAX_CONCURRENCY, 3, { min: 1, max: 10 }),
    maxAttempts: integer(env.MEMORY_EMBEDDING_MAX_ATTEMPTS, 5, { min: 1, max: 10 }),
    retryBaseMs: integer(env.MEMORY_EMBEDDING_RETRY_BASE_MS, 1000, {
      min: 100,
      max: 60_000,
    }),
    minImportance: integer(env.MEMORY_EMBEDDING_MIN_IMPORTANCE, 30, {
      min: 0,
      max: 100,
    }),
    timeoutMs: integer(env.MEMORY_EMBEDDING_TIMEOUT_MS, 30_000, {
      min: 1000,
      max: 120_000,
    }),
    pollIntervalMs: integer(env.MEMORY_EMBEDDING_POLL_INTERVAL_MS, 5000, {
      min: 1000,
      max: 60_000,
    }),
    leaseMs: integer(env.MEMORY_EMBEDDING_LEASE_MS, 120_000, {
      min: 30_000,
      max: 900_000,
    }),
  });
}

module.exports = {
  SUPPORTED_PROVIDERS,
  VECTOR_DIMENSIONS,
  buildMemoryEmbeddingConfig,
};
