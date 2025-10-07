import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TARGET_PLAN_ID = 'plan_RNJHCpbWJ6TwcH'

async function main() {
  console.log('--- Swap legacy MONTHLY -> vip-monthly (assign target Razorpay ID) ---')
  await prisma.$transaction(async tx => {
    const legacy = await tx.membershipPlan.findUnique({ where: { slug: 'MONTHLY' } })
    if (legacy) {
      console.log(`Found legacy MONTHLY (razorpayPlanId=${legacy.razorpayPlanId}) -> deleting first to clear unique constraint...`)
      await tx.membershipPlan.delete({ where: { id: legacy.id } })
      console.log('Deleted legacy MONTHLY row.')
    } else {
      console.log('No legacy MONTHLY row present.')
    }

    const vip = await tx.membershipPlan.findUnique({ where: { slug: 'vip-monthly' } })
    if (!vip) {
      console.log('vip-monthly row missing! Aborting.')
      return
    }
    if (vip.razorpayPlanId === TARGET_PLAN_ID) {
      console.log('vip-monthly already has target plan ID. No update needed.')
    } else {
      console.log(`Updating vip-monthly: ${vip.razorpayPlanId} -> ${TARGET_PLAN_ID}`)
      await tx.membershipPlan.update({
        where: { id: vip.id },
        data: { razorpayPlanId: TARGET_PLAN_ID }
      })
      console.log('Updated vip-monthly plan ID.')
    }
  })

  // Show final state
  const final = await prisma.membershipPlan.findMany({ select: { slug: true, razorpayPlanId: true }, orderBy: { slug: 'asc' } })
  console.log('Final plan rows:')
  for (const r of final) console.log(` - ${r.slug}: ${r.razorpayPlanId}`)
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
