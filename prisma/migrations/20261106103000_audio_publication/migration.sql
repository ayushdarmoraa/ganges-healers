-- Preserve visibility of existing audio. Managed creation explicitly starts in draft.
ALTER TABLE "AudioTrack" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "AudioTrack_isPublished_createdAt_idx" ON "AudioTrack"("isPublished", "createdAt" DESC);
