const assert = require("node:assert/strict");
const test = require("node:test");
const {
  VECTOR_DIMENSIONS,
  buildMemoryEmbeddingConfig,
} = require("../features/memory/config/memoryEmbedding.config");

test("memory embedding configuration is disabled by default and dimension locked", () => {
  const config = buildMemoryEmbeddingConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.model, "text-embedding-3-small");
  assert.equal(config.dimensions, VECTOR_DIMENSIONS);
});

test("memory embedding configuration rejects provider and vector dimension drift", () => {
  assert.throws(() => buildMemoryEmbeddingConfig({ EMBEDDING_PROVIDER: "OTHER" }), /unsupported/i);
  assert.throws(() => buildMemoryEmbeddingConfig({ EMBEDDING_DIMENSIONS: "3072" }), /pgvector column/i);
  assert.throws(() => buildMemoryEmbeddingConfig({ EMBEDDING_DIMENSIONS: "<matching dimensions>" }), /integer/i);
  assert.throws(() => buildMemoryEmbeddingConfig({ EMBEDDING_MODEL: "gpt-5.4" }), /text-embedding-3/i);
});
