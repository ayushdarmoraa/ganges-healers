-- CreateEnum
CREATE TYPE "public"."ProgramEnrollmentStatus" AS ENUM ('pending_payment', 'active', 'completed', 'paused', 'cancelled');

-- CreateTable
CREATE TABLE "public"."Program" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "sessionsPerWeek" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgramEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "healerId" TEXT,
    "status" "public"."ProgramEnrollmentStatus" NOT NULL DEFAULT 'pending_payment',
    "schedule" JSONB,
    "progress" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "public"."Program"("slug");

-- CreateIndex
CREATE INDEX "Program_isActive_idx" ON "public"."Program"("isActive");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_userId_status_idx" ON "public"."ProgramEnrollment"("userId", "status");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_programId_idx" ON "public"."ProgramEnrollment"("programId");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_healerId_idx" ON "public"."ProgramEnrollment"("healerId");

-- AddForeignKey
ALTER TABLE "public"."ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_healerId_fkey" FOREIGN KEY ("healerId") REFERENCES "public"."Healer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
