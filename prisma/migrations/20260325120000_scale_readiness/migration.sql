-- 1. Composite indexes on FunnelEvent (scale queries)
CREATE INDEX "FunnelEvent_sessionId_createdAt_idx" ON "FunnelEvent"("sessionId", "createdAt");
CREATE INDEX "FunnelEvent_type_createdAt_idx" ON "FunnelEvent"("type", "createdAt");

-- 2. Partial index for purchase events (analytics fast path)
CREATE INDEX "FunnelEvent_purchase_createdAt_idx"
ON "FunnelEvent"("createdAt")
WHERE "type" = 'purchase';

-- 3. DailyFunnelStats pre-aggregation table
CREATE TABLE "DailyFunnelStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quizStart" INTEGER NOT NULL DEFAULT 0,
    "quizComplete" INTEGER NOT NULL DEFAULT 0,
    "productView" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "checkoutStart" INTEGER NOT NULL DEFAULT 0,
    "purchase" INTEGER NOT NULL DEFAULT 0,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFunnelStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyFunnelStats_date_key" ON "DailyFunnelStats"("date");
CREATE INDEX "DailyFunnelStats_date_idx" ON "DailyFunnelStats"("date");

-- 4. Experiment scope field + index for mutual exclusion
ALTER TABLE "Experiment" ADD COLUMN "scope" TEXT;
CREATE INDEX "Experiment_scope_isActive_idx" ON "Experiment"("scope", "isActive");
