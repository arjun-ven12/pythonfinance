CREATE TYPE "LedgerEventType" AS ENUM (
  'DEPOSIT',
  'WITHDRAWAL',
  'BUY_ORDER',
  'SELL_ORDER',
  'FILL',
  'FEE',
  'DIVIDEND',
  'MARK_TO_MARKET',
  'POSITION_ADJUSTMENT'
);

CREATE TABLE "TransactionLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "LedgerEventType" NOT NULL,
  "symbol" TEXT,
  "quantity" DECIMAL(24,8),
  "price" DECIMAL(24,8),
  "cashDelta" DECIMAL(24,8) NOT NULL DEFAULT 0,
  "positionDelta" DECIMAL(24,8) NOT NULL DEFAULT 0,
  "tradeId" TEXT,
  "approvalId" TEXT,
  "metadata" JSONB,
  "previousHash" TEXT,
  "eventHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransactionLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioReconciliation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "matched" BOOLEAN NOT NULL,
  "cashDifference" DECIMAL(24,8) NOT NULL DEFAULT 0,
  "positionDifference" JSONB NOT NULL,
  "ledgerCalculatedState" JSONB NOT NULL,
  "cachedPortfolioState" JSONB,
  "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortfolioReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionLedger_eventHash_key"
  ON "TransactionLedger"("eventHash");
CREATE INDEX "TransactionLedger_userId_createdAt_idx"
  ON "TransactionLedger"("userId", "createdAt");
CREATE INDEX "TransactionLedger_userId_symbol_createdAt_idx"
  ON "TransactionLedger"("userId", "symbol", "createdAt");
CREATE INDEX "TransactionLedger_tradeId_idx"
  ON "TransactionLedger"("tradeId");
CREATE INDEX "TransactionLedger_approvalId_idx"
  ON "TransactionLedger"("approvalId");
CREATE INDEX "PortfolioReconciliation_userId_lastChecked_idx"
  ON "PortfolioReconciliation"("userId", "lastChecked");

ALTER TABLE "TransactionLedger"
  ADD CONSTRAINT "TransactionLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PortfolioReconciliation"
  ADD CONSTRAINT "PortfolioReconciliation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION prevent_transaction_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'TransactionLedger is append-only; create a compensating event instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransactionLedger_immutable"
BEFORE UPDATE OR DELETE ON "TransactionLedger"
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_ledger_mutation();
