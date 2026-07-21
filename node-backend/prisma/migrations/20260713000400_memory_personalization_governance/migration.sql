ALTER TABLE "MemoryRetrievalAudit"
  ADD COLUMN "profileVersion" INTEGER,
  ADD COLUMN "preferenceIds" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "patternIds" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "UserMemoryProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL, "summary" TEXT NOT NULL, "evidenceCount" INTEGER NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastReviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "UserMemoryProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserMemoryProfile_userId_version_key" ON "UserMemoryProfile"("userId", "version");
CREATE INDEX "UserMemoryProfile_userId_status_generatedAt_idx" ON "UserMemoryProfile"("userId", "status", "generatedAt");

CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "preferenceType" TEXT NOT NULL, "key" TEXT NOT NULL,
  "value" JSONB NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "evidenceCount" INTEGER NOT NULL,
  "evidenceIds" JSONB NOT NULL DEFAULT '[]', "contradictingIds" JSONB NOT NULL DEFAULT '[]',
  "source" TEXT NOT NULL, "status" TEXT NOT NULL, "firstObservedAt" TIMESTAMP(3) NOT NULL,
  "lastObservedAt" TIMESTAMP(3) NOT NULL, "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserPreference_userId_preferenceType_status_idx" ON "UserPreference"("userId", "preferenceType", "status");
CREATE INDEX "UserPreference_userId_key_updatedAt_idx" ON "UserPreference"("userId", "key", "updatedAt");

CREATE TABLE "UserBehaviorPattern" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "patternType" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL, "structuredData" JSONB NOT NULL, "confidence" DOUBLE PRECISION NOT NULL,
  "sampleSize" INTEGER NOT NULL, "supportingMemoryIds" JSONB NOT NULL, "contradictingMemoryIds" JSONB NOT NULL,
  "firstObservedAt" TIMESTAMP(3) NOT NULL, "lastObservedAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserBehaviorPattern_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserBehaviorPattern_userId_patternType_status_idx" ON "UserBehaviorPattern"("userId", "patternType", "status");
CREATE INDEX "UserBehaviorPattern_userId_updatedAt_idx" ON "UserBehaviorPattern"("userId", "updatedAt");

CREATE TABLE "MemoryPersonalizationSetting" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "globalMode" TEXT NOT NULL DEFAULT 'EVIDENCE_ONLY',
  "strategyMode" TEXT NOT NULL DEFAULT 'EVIDENCE_ONLY', "portfolioMode" TEXT NOT NULL DEFAULT 'EVIDENCE_ONLY',
  "matrixMode" TEXT NOT NULL DEFAULT 'EVIDENCE_ONLY', "researchMode" TEXT NOT NULL DEFAULT 'EVIDENCE_ONLY',
  "inferredRequiresReview" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryPersonalizationSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemoryPersonalizationSetting_userId_key" ON "MemoryPersonalizationSetting"("userId");

ALTER TABLE "UserMemoryProfile" ADD CONSTRAINT "UserMemoryProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBehaviorPattern" ADD CONSTRAINT "UserBehaviorPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryPersonalizationSetting" ADD CONSTRAINT "MemoryPersonalizationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
