-- Nullable for existing enrollments: do not infer a historical price from mutable
-- catalog data or legacy payment metadata. New purchase requests freeze a quote.
ALTER TABLE "ProgramEnrollment" ADD COLUMN "pricePaise" INTEGER;
ALTER TABLE "CourseEnrollment" ADD COLUMN "pricePaise" INTEGER;
