import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.membershipPlan.findMany({
    select: { id: true, slug: true, razorpayPlanId: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { slug: 'asc' }
  })
  if (rows.length === 0) {
    console.log('No membership plans found.')
  } else {
    console.log('Membership Plans:')
    for (const r of rows) {
      console.log(`- ${r.slug} :: ${r.razorpayPlanId} (id=${r.id}, active=${r.isActive})`) 
    }
  }
}

main().catch(err => {
  console.error('Failed to list plans:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
