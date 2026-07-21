require("dotenv").config();
const prisma = require("../services/prisma");
const { createMemoryIngestionService } = require("../features/memory/services/memoryIngestion.service");
const { createMemoryBackfillService } = require("../features/memory/services/memoryBackfill.service");

async function main() {
  const userArg = process.argv.find((arg) => arg.startsWith("--user=")); const afterArg = process.argv.find((arg) => arg.startsWith("--after=")); const limitArg = process.argv.find((arg) => arg.startsWith("--limit=")); const offsetArg = process.argv.find((arg) => arg.startsWith("--offset=")); const dryRun = process.argv.includes("--dry-run");
  if (!userArg) throw new Error("Usage: node scripts/backfill-memory.js --user=<userId> [--dry-run] [--after=<ISO date>] [--offset=0] [--limit=100]");
  const ingestionService = createMemoryIngestionService({ prisma }); const service = createMemoryBackfillService({ prisma, ingestionService });
  const result = await service.run(userArg.slice(7), { dryRun, after: afterArg?.slice(8), offset: offsetArg?.slice(9), limit: limitArg?.slice(8) }); console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
