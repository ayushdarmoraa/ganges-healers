-- Existing accounts keep password-only behavior until their owner enables the factor.
ALTER TABLE "User" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "TwoFactorCredential" (
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "encryptedSecret" TEXT,
  "pendingEncryptedSecret" TEXT,
  "pendingPasswordVersion" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "lastAcceptedStep" BIGINT,
  "recoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "failureWindowStart" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TwoFactorCredential_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "TwoFactorCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TwoFactorCredential_valid_failures" CHECK ("failedAttempts" >= 0)
);
