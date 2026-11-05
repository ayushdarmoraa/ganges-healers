-- Add actual reservations without treating older suggested schedule JSON as booked appointments.
CREATE TYPE "ProgramSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TABLE "ProgramSession" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "healerId" TEXT NOT NULL,
  "sessionNumber" INTEGER NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMin" INTEGER NOT NULL,
  "status" "ProgramSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "completedAt" TIMESTAMP(3),
  "meetingLink" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgramSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgramSession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProgramSession_healerId_fkey" FOREIGN KEY ("healerId") REFERENCES "Healer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProgramSession_positive_session_number" CHECK ("sessionNumber" > 0),
  CONSTRAINT "ProgramSession_valid_duration" CHECK ("durationMin" > 0 AND "durationMin" <= 1440)
);
CREATE UNIQUE INDEX "ProgramSession_enrollmentId_sessionNumber_key" ON "ProgramSession"("enrollmentId", "sessionNumber");
CREATE INDEX "ProgramSession_healerId_scheduledAt_status_idx" ON "ProgramSession"("healerId", "scheduledAt", "status");

-- Staff assignment is separate from the healer binding recorded in the original paid quote.
ALTER TABLE "ProgramEnrollment" ADD COLUMN "assignedHealerId" TEXT;
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_assignedHealerId_fkey" FOREIGN KEY ("assignedHealerId") REFERENCES "Healer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProgramEnrollment_assignedHealerId_idx" ON "ProgramEnrollment"("assignedHealerId");
