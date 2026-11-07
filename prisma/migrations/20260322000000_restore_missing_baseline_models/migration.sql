CREATE TABLE IF NOT EXISTS "QuizLead" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT, "intention" TEXT NOT NULL DEFAULT '', "practice" TEXT NOT NULL DEFAULT '', "chakra" TEXT NOT NULL DEFAULT '', "productSlug" TEXT, "productTitle" TEXT, "email1SentAt" TIMESTAMP(3), "email2SentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "QuizLead_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "QuizLead_email_intention_practice_chakra_key" ON "QuizLead" ("email", "intention", "practice", "chakra");
CREATE INDEX IF NOT EXISTS "QuizLead_email_idx" ON "QuizLead" ("email");
CREATE INDEX IF NOT EXISTS "QuizLead_createdAt_idx" ON "QuizLead" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "QuizLead_email1SentAt_email2SentAt_idx" ON "QuizLead" ("email1SentAt", "email2SentAt");
CREATE TABLE IF NOT EXISTS "OptimizationLog" ("id" TEXT NOT NULL, "action" TEXT NOT NULL, "stage" TEXT, "reason" TEXT NOT NULL, "metrics" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OptimizationLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "OptimizationLog_action_idx" ON "OptimizationLog" ("action");
CREATE INDEX IF NOT EXISTS "OptimizationLog_createdAt_idx" ON "OptimizationLog" ("createdAt" DESC);
