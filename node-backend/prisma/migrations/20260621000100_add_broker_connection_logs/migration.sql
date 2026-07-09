CREATE TABLE "BrokerConnectionLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "latency" DOUBLE PRECISION,
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BrokerConnectionLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrokerConnectionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BrokerConnectionLog_userId_timestamp_idx" ON "BrokerConnectionLog"("userId", "timestamp");
CREATE INDEX "BrokerConnectionLog_userId_action_idx" ON "BrokerConnectionLog"("userId", "action");
