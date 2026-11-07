ALTER TABLE "Order" ADD COLUMN "trackingInfo" JSONB;

CREATE INDEX "Order_status_createdAt_id_idx" ON "Order"("status", "createdAt", "id");
