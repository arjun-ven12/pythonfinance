ALTER TABLE "PlaybookRun"
  ADD COLUMN "marketRegime" TEXT;

DROP TRIGGER IF EXISTS "PlaybookRun_append_only" ON "PlaybookRun";

UPDATE "PlaybookRun"
SET "marketRegime" = "regime"
WHERE "marketRegime" IS NULL;

CREATE TRIGGER "PlaybookRun_append_only"
BEFORE UPDATE OR DELETE ON "PlaybookRun"
FOR EACH ROW EXECUTE FUNCTION prevent_playbook_history_mutation();

CREATE INDEX "PlaybookRun_userId_marketRegime_idx"
  ON "PlaybookRun"("userId", "marketRegime");
