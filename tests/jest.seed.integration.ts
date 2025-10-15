import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedIntegrationMinimal() {
  // Ensure at least 1 service + 1 healer linked by specialization, and membership canonical plans
  const svc = await prisma.service.upsert({
    where: { slug: 'reiki-healing' },
    update: {},
    create: {
      name: 'Reiki Healing', slug: 'reiki-healing', description: 'Energy healing',
      tagline: 'Universal energy', category: 'Energy Healing', price: 7000, duration: 60, mode: 'BOTH', benefits: ['Relaxation']
    }
  })
  // Create healer user
  const healerUser = await prisma.user.upsert({
    where: { email: 'itest.healer@example.com' },
    update: {},
    create: { email: 'itest.healer@example.com', password: 'hashed', role: 'HEALER', name: 'ITest Healer' }
  })
  await prisma.healer.upsert({
    where: { userId: healerUser.id },
    update: { isVerified: true, availability: { monday: { start: '10:00', end: '20:00' } }, specializations: ['Reiki'], experienceYears: 5, rating: 4.8 },
    create: { userId: healerUser.id, isVerified: true, availability: { monday: { start: '10:00', end: '20:00' } }, specializations: ['Reiki'], experienceYears: 5, rating: 4.8 }
  })

  // Canonical membership plans
  await prisma.membershipPlan.upsert({
    where: { slug: 'vip-monthly' },
    update: { isActive: true, razorpayPlanId: 'plan_test_monthly' },
    create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_test_monthly', isActive: true, benefits: { freeSessions: 2 } }
  })
  await prisma.membershipPlan.upsert({
    where: { slug: 'vip-yearly' },
    update: { isActive: true, razorpayPlanId: 'plan_test_yearly' },
    create: { slug: 'vip-yearly', title: 'VIP Yearly', pricePaise: 199000, interval: 'YEARLY', razorpayPlanId: 'plan_test_yearly', isActive: true, benefits: { freeSessions: 24 } }
  })

  return { serviceId: svc.id }
}

export async function cleanupIntegrationMinimal() {
  // Intentionally minimal cleanup; tests also do local deletions
}
