ALTER TABLE "StrategyExperiment"
  ADD COLUMN "encryptedStrategy" TEXT,
  ADD COLUMN "encryptedStrategyKey" TEXT,
  ADD COLUMN "strategyEncryptionIv" TEXT,
  ADD COLUMN "strategyEncryptionTag" TEXT,
  ADD COLUMN "strategyEncryptionKeyIv" TEXT,
  ADD COLUMN "strategyEncryptionKeyTag" TEXT,
  ADD COLUMN "strategyEncryptionAlgorithmVersion" TEXT;

ALTER TABLE "StrategyVersion"
  ALTER COLUMN "strategyJson" DROP NOT NULL,
  ADD COLUMN "encryptedStrategy" TEXT,
  ADD COLUMN "encryptedStrategyKey" TEXT,
  ADD COLUMN "strategyEncryptionIv" TEXT,
  ADD COLUMN "strategyEncryptionTag" TEXT,
  ADD COLUMN "strategyEncryptionKeyIv" TEXT,
  ADD COLUMN "strategyEncryptionKeyTag" TEXT,
  ADD COLUMN "strategyEncryptionAlgorithmVersion" TEXT;
