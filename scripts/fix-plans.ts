import { PrismaClient } from '@prisma/client'

// Script: Update Razorpay plan IDs for membership plans.
// Usage (PowerShell):
//   $env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST/DB?sslmode=require'; pnpm exec tsx scripts/fix-plans.ts
// Or if added to package.json scripts: pnpm run db:fix-plans

const prisma = new PrismaClient()

// Desired target plan IDs (edit here if they change later)
const TARGET = {
  'vip-monthly': 'plan_RNJHCpbWJ6TwcH',
  'vip-yearly': 'plan_RQ8lRhJvV5jTdX',
} as const

async function updateOne(slug: keyof typeof TARGET) {
  const newId = TARGET[slug]
  const existing = await prisma.membershipPlan.findUnique({ where: { slug }, select: { razorpayPlanId: true } })
  if (!existing) {
    console.error(`❌ Plan with slug "${slug}" not found. Aborting.`)
    return false
  }
  if (existing.razorpayPlanId === newId) {
    console.log(`ℹ️  ${slug} already set to ${newId} (no change)`)
    return true
  }
  const updated = await prisma.membershipPlan.update({ where: { slug }, data: { razorpayPlanId: newId } })
  console.log(`✅ Updated ${slug}: ${existing.razorpayPlanId} -> ${updated.razorpayPlanId}`)
  return true
}

async function main() {
  console.log('--- Fix Membership Plans (Razorpay IDs) ---')
  const results = await Promise.all([
    updateOne('vip-monthly'),
    updateOne('vip-yearly'),
  ])
  const ok = results.every(Boolean)
  if (!ok) {
    console.error('One or more updates failed.')
    process.exitCode = 1
  } else {
    console.log('✔ All specified plans processed successfully.')
  }

  // Show final snapshot
  const rows = await prisma.membershipPlan.findMany({
    where: { slug: { in: Object.keys(TARGET) } },
    select: { slug: true, razorpayPlanId: true },
    orderBy: { slug: 'asc' }
  })
  console.log('Final plan IDs:')
  for (const r of rows) {
    console.log(` - ${r.slug}: ${r.razorpayPlanId}`)
  }
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
