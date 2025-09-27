-- Booking composite & supporting indexes
CREATE INDEX IF NOT EXISTS "Booking_userId_scheduledAt_desc_idx" ON "Booking" ("userId", "scheduledAt" DESC);
CREATE INDEX IF NOT EXISTS "Booking_healerId_scheduledAt_status_idx" ON "Booking" ("healerId", "scheduledAt", "status");
-- Retain single scheduledAt index if not already present (idempotent)
CREATE INDEX IF NOT EXISTS "Booking_scheduledAt_idx" ON "Booking" ("scheduledAt");

-- Partial unique index for payment idempotency (non-null paymentId)
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_paymentId_unique_not_null" ON "Payment"("paymentId") WHERE "paymentId" IS NOT NULL;
