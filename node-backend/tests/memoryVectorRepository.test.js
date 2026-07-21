const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryVectorRepository, validateVector } = require("../features/memory/repositories/memoryVector.repository");

test("vector validation enforces finite configured dimensions", () => {
  assert.equal(validateVector([1, 2, 3], 3), "[1,2,3]");
  assert.throws(() => validateVector([1, 2], 3), /exactly 3/i);
  assert.throws(() => validateVector([1, Number.NaN, 3], 3), /finite/i);
});

test("vector writes keep vector and ownership values parameterized", async () => {
  let invocation;
  const db = {
    $executeRaw: async (strings, ...values) => { invocation = { strings, values }; return 1; },
  };
  const repository = createMemoryVectorRepository({ prisma: { run: (operation) => operation(db) }, dimensions: 3 });
  const count = await repository.storeVector({ userId: "user-1", memoryEventId: "memory-1", claimToken: "claim-1", vector: [0.1, 0.2, 0.3], sourceContentHash: "hash-1" });
  assert.equal(count, 1);
  assert.equal(invocation.strings.join("?").includes("[0.1,0.2,0.3]"), false);
  assert.ok(invocation.values.includes("[0.1,0.2,0.3]"));
  assert.ok(invocation.values.includes("user-1"));
  assert.ok(invocation.values.includes("memory-1"));
});

test("database job claiming uses skip-locked concurrency and lease recovery", async () => {
  let sql;
  const db = {
    $queryRaw: async (strings) => { sql = strings.join("?"); return []; },
  };
  const repository = createMemoryVectorRepository({ prisma: { run: (operation) => operation(db) }, dimensions: 3 });
  await repository.claimBatch({ limit: 5, maxAttempts: 3, leaseMs: 60_000 });
  assert.match(sql, /FOR UPDATE SKIP LOCKED/i);
  assert.match(sql, /"status" = 'PROCESSING' AND "claimedAt" </i);
  assert.match(sql, /"attemptCount" </i);
});

test("semantic vector search scopes ownership and exclusions inside parameterized SQL", async () => {
  let query;
  const db = { $queryRaw: async (value) => { query = value; return []; } };
  const repository = createMemoryVectorRepository({ prisma: { run: (operation) => operation(db) }, dimensions: 3 });
  await repository.searchSimilar({ userId: "user-1", vector: [0.1, 0.2, 0.3], filters: { categories: ["TRADE"], entityFilters: [{ entityType: "SYMBOL", entityId: "NVDA" }], minimumImportance: 30 }, limit: 20, minimumSimilarity: 0.4 });
  assert.match(query.sql, /event\."userId"/);
  assert.match(query.sql, /event\."excludedFromAi" = false/);
  assert.match(query.sql, /embedding\."status" = 'COMPLETED'/);
  assert.match(query.sql, /link\."userId"/);
  assert.ok(query.values.includes("user-1"));
  assert.ok(query.values.includes("NVDA"));
  assert.equal(query.sql.includes("NVDA"), false);
});

test("pgvector migration enables extension and uses one dimensioned vector column", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260713000200_memory_embeddings_pgvector/migration.sql"), "utf8");
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS vector/i);
  assert.match(sql, /"embedding" vector\(1536\)/i);
  assert.match(sql, /MemoryEmbedding_memoryEventId_fkey[\s\S]*ON DELETE CASCADE/i);
  assert.doesNotMatch(sql, /ivfflat/i);
});
