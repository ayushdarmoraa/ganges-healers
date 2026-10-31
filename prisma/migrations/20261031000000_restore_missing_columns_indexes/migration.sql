-- Restore schema objects present in production but missing from fresh database migrations.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstSource" TEXT, ADD COLUMN IF NOT EXISTS "firstVariant" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "chakra" TEXT, ADD COLUMN IF NOT EXISTS "spiritualBenefits" JSONB, ADD COLUMN IF NOT EXISTS "ritualUse" JSONB, ADD COLUMN IF NOT EXISTS "consecrationStory" TEXT, ADD COLUMN IF NOT EXISTS "isConsecrated" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Experiment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active', ADD COLUMN IF NOT EXISTS "winner" TEXT, ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Order_paymentId_key" ON "Order" ("paymentId");
CREATE INDEX IF NOT EXISTS "Experiment_status_idx" ON "Experiment" ("status");
CREATE INDEX IF NOT EXISTS "Booking_userId_scheduledAt_desc_idx" ON "Booking" ("userId", "scheduledAt" DESC);
