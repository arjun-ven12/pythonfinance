require("dotenv").config();

const prisma = require("../services/prisma");
const { buildMemoryEmbeddingConfig } = require("../features/memory/config/memoryEmbedding.config");
const { createEmbeddingProvider } = require("../features/memory/services/embeddingProvider.service");
const { createMemoryVectorRepository } = require("../features/memory/repositories/memoryVector.repository");
const { createMemoryEmbeddingService } = require("../features/memory/services/memoryEmbedding.service");
const { createMemoryEmbeddingBackfillService } = require("../features/memory/services/memoryEmbeddingBackfill.service");

function args(argv) {
  const output = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, value = "true"] = item.slice(2).split("=");
    output[key] = value;
  }
  return output;
}

async function main() {
  const options = args(process.argv.slice(2));
  if (!options.userId) throw new Error("--userId is required for embedding backfill.");
  const config = buildMemoryEmbeddingConfig({ ...process.env, MEMORY_EMBEDDING_ENABLED: "true" });
  const provider = createEmbeddingProvider({ config });
  const vectorRepository = createMemoryVectorRepository({ prisma, dimensions: config.dimensions });
  const embeddingService = createMemoryEmbeddingService({ prisma, config, provider, vectorRepository });
  const backfillService = createMemoryEmbeddingBackfillService({ prisma, embeddingService, config });
  const result = await backfillService.run(options.userId, {
    ...options,
    minImportance: options.minImportance ? Number(options.minImportance) : undefined,
    limit: options.limit ? Number(options.limit) : undefined,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.dryRun && options.process === "true") {
    let batch;
    do {
      batch = await embeddingService.processBatch();
      console.log(JSON.stringify(batch));
    } while (batch.claimed > 0);
  }
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
