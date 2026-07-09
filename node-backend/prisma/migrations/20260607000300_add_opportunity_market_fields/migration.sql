ALTER TABLE "Opportunity"
ADD COLUMN IF NOT EXISTS "market" TEXT,
ADD COLUMN IF NOT EXISTS "exchange" TEXT,
ADD COLUMN IF NOT EXISTS "currency" TEXT,
ADD COLUMN IF NOT EXISTS "country" TEXT,
ADD COLUMN IF NOT EXISTS "displaySymbol" TEXT,
ADD COLUMN IF NOT EXISTS "yahooSymbol" TEXT;

CREATE INDEX IF NOT EXISTS "Opportunity_market_idx" ON "Opportunity"("market");
CREATE INDEX IF NOT EXISTS "Opportunity_exchange_idx" ON "Opportunity"("exchange");
