DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('LEVEL_1_USER', 'LEVEL_2_ADMIN', 'LEVEL_3_OWNER_ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AppPageKey" AS ENUM (
    'DASHBOARD',
    'SCANNER',
    'WATCHLIST',
    'STRATEGY_LAB',
    'PLAYBOOK',
    'VALIDATION',
    'BROKER',
    'ALERTS',
    'TRADES',
    'APPROVALS',
    'PORTFOLIO',
    'SETTINGS',
    'ADMIN_DASHBOARD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminAuditAction" AS ENUM (
    'VERIFY_USER',
    'REJECT_USER',
    'SUSPEND_USER',
    'PROMOTE_ROLE',
    'DEMOTE_ROLE',
    'GRANT_PAGE_ACCESS',
    'REVOKE_PAGE_ACCESS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'LEVEL_1_USER',
  ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verifiedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lastRoleChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "roleChangedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UserPageAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pageKey" "AppPageKey" NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedByUserId" TEXT,
  CONSTRAINT "UserPageAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "action" "AdminAuditAction" NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPageAccess_userId_pageKey_key"
  ON "UserPageAccess"("userId", "pageKey");
CREATE INDEX IF NOT EXISTS "User_role_verificationStatus_idx"
  ON "User"("role", "verificationStatus");
CREATE INDEX IF NOT EXISTS "User_verifiedByUserId_idx"
  ON "User"("verifiedByUserId");
CREATE INDEX IF NOT EXISTS "User_roleChangedByUserId_idx"
  ON "User"("roleChangedByUserId");
CREATE INDEX IF NOT EXISTS "UserPageAccess_userId_idx"
  ON "UserPageAccess"("userId");
CREATE INDEX IF NOT EXISTS "UserPageAccess_updatedByUserId_idx"
  ON "UserPageAccess"("updatedByUserId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx"
  ON "AdminAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetUserId_createdAt_idx"
  ON "AdminAuditLog"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_createdAt_idx"
  ON "AdminAuditLog"("action", "createdAt");

DO $$
BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_verifiedByUserId_fkey"
    FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_roleChangedByUserId_fkey"
    FOREIGN KEY ("roleChangedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "UserPageAccess"
    ADD CONSTRAINT "UserPageAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "UserPageAccess"
    ADD CONSTRAINT "UserPageAccess_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AdminAuditLog"
    ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AdminAuditLog"
    ADD CONSTRAINT "AdminAuditLog_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
