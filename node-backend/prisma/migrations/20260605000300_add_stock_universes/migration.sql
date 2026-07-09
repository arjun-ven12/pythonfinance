CREATE TYPE "StockUniverseType" AS ENUM (
  'MANUAL',
  'WATCHLIST',
  'SECTOR',
  'INDUSTRY',
  'S_AND_P_500_SAMPLE',
  'CUSTOM_SCREEN'
);

CREATE TABLE "StockUniverse" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "universeType" "StockUniverseType" NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockUniverse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockUniverseMember" (
  "id" TEXT NOT NULL,
  "universeId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "companyName" TEXT,
  "sector" TEXT,
  "industry" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockUniverseMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockUniverse_universeType_idx" ON "StockUniverse"("universeType");
CREATE INDEX "StockUniverse_createdAt_idx" ON "StockUniverse"("createdAt");
CREATE UNIQUE INDEX "StockUniverseMember_universeId_symbol_key" ON "StockUniverseMember"("universeId", "symbol");
CREATE INDEX "StockUniverseMember_symbol_idx" ON "StockUniverseMember"("symbol");
CREATE INDEX "StockUniverseMember_sector_idx" ON "StockUniverseMember"("sector");
CREATE INDEX "StockUniverseMember_industry_idx" ON "StockUniverseMember"("industry");
CREATE INDEX "StockUniverseMember_universeId_idx" ON "StockUniverseMember"("universeId");

ALTER TABLE "StockUniverseMember"
  ADD CONSTRAINT "StockUniverseMember_universeId_fkey"
  FOREIGN KEY ("universeId")
  REFERENCES "StockUniverse"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
