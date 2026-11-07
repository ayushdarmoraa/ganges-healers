ALTER TABLE "Order" ADD COLUMN "checkoutKey" TEXT;

CREATE UNIQUE INDEX "Order_userId_checkoutKey_key" ON "Order"("userId", "checkoutKey");
