-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "finalConfidence" DOUBLE PRECISION;
ALTER TABLE "Opportunity" ADD COLUMN "confidenceBreakdown" JSONB;
ALTER TABLE "Opportunity" ADD COLUMN "sector" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "marketRegime" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN "scanTimestamp" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Opportunity_sector_idx" ON "Opportunity"("sector");

-- CreateIndex
CREATE INDEX "Opportunity_marketRegime_idx" ON "Opportunity"("marketRegime");

-- CreateIndex
CREATE INDEX "Opportunity_scanTimestamp_idx" ON "Opportunity"("scanTimestamp");
