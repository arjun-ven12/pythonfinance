-- Add data freshness metadata captured from scan_results.json.
ALTER TABLE "Scan" ADD COLUMN "externalScanId" TEXT;
ALTER TABLE "Scan" ADD COLUMN "scanDuration" DOUBLE PRECISION;

CREATE UNIQUE INDEX "Scan_externalScanId_key" ON "Scan"("externalScanId");
