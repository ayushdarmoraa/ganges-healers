-- Additive: existing accounts retain null until their password changes.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
