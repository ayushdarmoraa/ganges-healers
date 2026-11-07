-- AlterTable
ALTER TABLE "FunnelEvent" ADD COLUMN "experimentVariant" TEXT;
ALTER TABLE "FunnelEvent" ADD COLUMN "source" TEXT;
ALTER TABLE "FunnelEvent" ADD COLUMN "chakra" TEXT;

-- CreateIndex
CREATE INDEX "FunnelEvent_source_idx" ON "FunnelEvent"("source");
CREATE INDEX "FunnelEvent_experimentVariant_idx" ON "FunnelEvent"("experimentVariant");
