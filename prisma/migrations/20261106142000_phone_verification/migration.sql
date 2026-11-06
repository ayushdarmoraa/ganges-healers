-- Existing phone numbers remain unverified; no account, credential or billing row is rewritten.
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3), ADD COLUMN "phoneVerifiedHash" TEXT;

CREATE TABLE "PhoneVerification" (
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "credentialVersion" TEXT NOT NULL,
  "providerId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "nextSendAt" TIMESTAMP(3) NOT NULL,
  "sendWindowStart" TIMESTAMP(3) NOT NULL,
  "sendsInWindow" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "checkingId" TEXT,
  "checkingUntil" TIMESTAMP(3),
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
