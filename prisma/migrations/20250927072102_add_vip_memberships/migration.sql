-- CreateEnum
CREATE TYPE "public"."MembershipInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('pending', 'active', 'paused', 'cancelled', 'halted');

-- CreateTable
CREATE TABLE "public"."MembershipPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "interval" "public"."MembershipInterval" NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "benefits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VIPMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'pending',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VIPMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SessionCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "credits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunityAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "public"."MembershipPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_razorpayPlanId_key" ON "public"."MembershipPlan"("razorpayPlanId");

-- CreateIndex
CREATE INDEX "MembershipPlan_isActive_idx" ON "public"."MembershipPlan"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VIPMembership_subscriptionId_key" ON "public"."VIPMembership"("subscriptionId");

-- CreateIndex
CREATE INDEX "VIPMembership_userId_status_idx" ON "public"."VIPMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "VIPMembership_planId_idx" ON "public"."VIPMembership"("planId");

-- CreateIndex
CREATE INDEX "SessionCredit_userId_idx" ON "public"."SessionCredit"("userId");

-- CreateIndex
CREATE INDEX "SessionCredit_membershipId_idx" ON "public"."SessionCredit"("membershipId");

-- CreateIndex
CREATE INDEX "CommunityAccess_userId_level_idx" ON "public"."CommunityAccess"("userId", "level");

-- AddForeignKey
ALTER TABLE "public"."VIPMembership" ADD CONSTRAINT "VIPMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VIPMembership" ADD CONSTRAINT "VIPMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionCredit" ADD CONSTRAINT "SessionCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SessionCredit" ADD CONSTRAINT "SessionCredit_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "public"."VIPMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityAccess" ADD CONSTRAINT "CommunityAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
