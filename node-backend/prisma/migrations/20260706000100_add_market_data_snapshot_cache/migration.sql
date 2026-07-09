CREATE TABLE IF NOT EXISTS "MarketDataSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "rangeKey" TEXT NOT NULL DEFAULT 'QUOTE',
  "timeframeKey" TEXT NOT NULL DEFAULT '',
  "market" TEXT,
  "currency" TEXT,
  "interval" TEXT,
  "provider" TEXT,
  "source" TEXT,
  "lastUpdated" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketDataSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketDataSnapshot_userId_symbol_scope_rangeKey_timeframeKey_key"
  ON "MarketDataSnapshot"("userId", "symbol", "scope", "rangeKey", "timeframeKey");

CREATE INDEX IF NOT EXISTS "MarketDataSnapshot_userId_updatedAt_idx"
  ON "MarketDataSnapshot"("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "MarketDataSnapshot_userId_symbol_updatedAt_idx"
  ON "MarketDataSnapshot"("userId", "symbol", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'MarketDataSnapshot_userId_fkey'
  ) THEN
    ALTER TABLE "MarketDataSnapshot"
      ADD CONSTRAINT "MarketDataSnapshot_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
