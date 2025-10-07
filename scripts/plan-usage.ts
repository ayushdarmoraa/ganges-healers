import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const plans = await prisma.membershipPlan.findMany({
    select: { id: true, slug: true }
  })
  const memberships = await prisma.vIPMembership.groupBy({
    by: ['planId'],
    _count: { planId: true }
  })
  const usage = new Map(memberships.map(m => [m.planId, m._count.planId]))
  console.log('Plan Usage:')
  for (const p of plans) {
    console.log(`- ${p.slug} (id=${p.id}) -> ${usage.get(p.id) || 0} memberships`)
  }
}

main().catch(err => {
  console.error('Failed to compute usage:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
