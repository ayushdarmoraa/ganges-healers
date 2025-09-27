/*
  Warnings:

  - You are about to drop the column `experienceY` on the `Healer` table. All the data in the column will be lost.
  - You are about to drop the column `basePrice` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `durationMin` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `Service` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gatewayOrderId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gatewayPaymentId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Healer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `duration` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `Service` required. This step will fail if there are existing NULL values in that column.
  - Made the column `category` on table `Service` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."ServiceMode" AS ENUM ('ONLINE', 'OFFLINE', 'BOTH');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('SESSION', 'PROGRAM', 'MEMBERSHIP', 'STORE', 'COURSE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- DropIndex
DROP INDEX "public"."Booking_healerId_scheduledAt_idx";

-- AlterTable
ALTER TABLE "public"."Healer" DROP COLUMN "experienceY",
ADD COLUMN     "certifications" JSONB,
ADD COLUMN     "experienceYears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "specializations" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "currency" TEXT DEFAULT 'INR',
ADD COLUMN     "gatewayOrderId" TEXT,
ADD COLUMN     "gatewayPaymentId" TEXT,
ADD COLUMN     "gatewaySignature" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "statusEnum" "public"."PaymentStatus",
ADD COLUMN     "type" "public"."PaymentType",
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Service" DROP COLUMN "basePrice",
DROP COLUMN "durationMin",
DROP COLUMN "imageUrl",
ADD COLUMN     "benefits" JSONB,
ADD COLUMN     "duration" INTEGER NOT NULL,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "mode" "public"."ServiceMode" NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "popularity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "price" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "category" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT,
    "gatewayRefundId" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_gatewayRefundId_key" ON "public"."Refund"("gatewayRefundId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "public"."Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "public"."Payment"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "public"."Payment"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_statusEnum_idx" ON "public"."Payment"("statusEnum");

-- CreateIndex
CREATE INDEX "Payment_type_idx" ON "public"."Payment"("type");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "public"."Payment"("userId");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."Booking_userId_scheduledAt_desc_idx" RENAME TO "Booking_userId_scheduledAt_idx";
