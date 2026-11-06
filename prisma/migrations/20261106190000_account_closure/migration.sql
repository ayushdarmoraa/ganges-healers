-- Closing an account revokes access without cascading through purchase history.
ALTER TABLE "User" ADD COLUMN "closedAt" TIMESTAMP(3);
