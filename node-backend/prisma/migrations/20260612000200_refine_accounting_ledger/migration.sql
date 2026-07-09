DROP TRIGGER IF EXISTS "TransactionLedger_immutable" ON "TransactionLedger";

CREATE TYPE "LedgerEventType_v2" AS ENUM (
  'ORDER_CREATED',
  'ORDER_APPROVED',
  'ORDER_REJECTED',
  'ORDER_EXECUTED',
  'BUY_FILL',
  'SELL_FILL',
  'FEE',
  'CASH_DEPOSIT',
  'CASH_WITHDRAWAL',
  'POSITION_MARK_TO_MARKET',
  'POSITION_CLOSE'
);

ALTER TABLE "TransactionLedger"
  ADD COLUMN "eventType" "LedgerEventType_v2",
  ADD COLUMN "occurredAt" TIMESTAMP(3),
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "executionId" TEXT,
  ADD COLUMN "fee" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

UPDATE "TransactionLedger"
SET
  "eventType" = (
    CASE
      WHEN "type"::text = 'DEPOSIT' THEN 'CASH_DEPOSIT'
      WHEN "type"::text = 'WITHDRAWAL' THEN 'CASH_WITHDRAWAL'
      WHEN "type"::text IN ('BUY_ORDER', 'SELL_ORDER') THEN 'ORDER_CREATED'
      WHEN "type"::text = 'FILL'
        AND COALESCE("metadata"->>'side', 'BUY') = 'SELL' THEN 'SELL_FILL'
      WHEN "type"::text = 'FILL' THEN 'BUY_FILL'
      WHEN "type"::text = 'FEE' THEN 'FEE'
      WHEN "type"::text = 'DIVIDEND' THEN 'CASH_DEPOSIT'
      WHEN "type"::text = 'MARK_TO_MARKET' THEN 'POSITION_MARK_TO_MARKET'
      WHEN "type"::text = 'POSITION_ADJUSTMENT'
        AND "positionDelta" < 0 THEN 'SELL_FILL'
      ELSE 'BUY_FILL'
    END
  )::"LedgerEventType_v2",
  "occurredAt" = "createdAt",
  "executionId" = "tradeId",
  "orderId" = COALESCE("approvalId", "tradeId"),
  "fee" = CASE WHEN "type"::text = 'FEE' THEN ABS("cashDelta") ELSE 0 END,
  "metadata" = COALESCE("metadata", '{}'::jsonb) ||
    jsonb_build_object(
      'legacyEventType', "type"::text,
      'hashVersion', 1
    );

ALTER TABLE "TransactionLedger"
  ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "occurredAt" SET NOT NULL;

DROP INDEX IF EXISTS "TransactionLedger_userId_createdAt_idx";
DROP INDEX IF EXISTS "TransactionLedger_userId_symbol_createdAt_idx";
DROP INDEX IF EXISTS "TransactionLedger_tradeId_idx";

ALTER TABLE "TransactionLedger"
  DROP COLUMN "type",
  DROP COLUMN "tradeId";

DROP TYPE "LedgerEventType";
ALTER TYPE "LedgerEventType_v2" RENAME TO "LedgerEventType";

CREATE INDEX "TransactionLedger_userId_occurredAt_idx"
  ON "TransactionLedger"("userId", "occurredAt");
CREATE INDEX "TransactionLedger_userId_symbol_idx"
  ON "TransactionLedger"("userId", "symbol");
CREATE INDEX "TransactionLedger_userId_eventType_idx"
  ON "TransactionLedger"("userId", "eventType");
CREATE INDEX "TransactionLedger_executionId_idx"
  ON "TransactionLedger"("executionId");
CREATE INDEX "TransactionLedger_orderId_idx"
  ON "TransactionLedger"("orderId");

ALTER TABLE "PortfolioReconciliation"
  ADD COLUMN "mismatchAmount" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "missingEvents" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "repairAction" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UNKNOWN';

CREATE TRIGGER "TransactionLedger_immutable"
BEFORE UPDATE OR DELETE ON "TransactionLedger"
FOR EACH ROW EXECUTE FUNCTION prevent_transaction_ledger_mutation();
