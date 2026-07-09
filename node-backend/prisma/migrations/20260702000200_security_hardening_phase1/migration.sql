CREATE TABLE "BrokerSecret" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "keyVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrokerSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrokerSecret_userId_provider_key" ON "BrokerSecret"("userId", "provider");
CREATE INDEX "BrokerSecret_userId_idx" ON "BrokerSecret"("userId");
CREATE INDEX "BrokerSecret_provider_idx" ON "BrokerSecret"("provider");

ALTER TABLE "BrokerSecret"
  ADD CONSTRAINT "BrokerSecret_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
