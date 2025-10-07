import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Remove Legacy MONTHLY Plan (migrate ID if needed) ---')
  const legacy = await prisma.membershipPlan.findUnique({ where: { slug: 'MONTHLY' } })
  if (!legacy) {
    console.log('No legacy MONTHLY row present. Nothing to do.')
    return
  }
  const vip = await prisma.membershipPlan.findUnique({ where: { slug: 'vip-monthly' } })
  if (!vip) {
    console.log('vip-monthly plan not found. Aborting to avoid data loss.')
    return
  }

  console.log(`Legacy MONTHLY razorpayPlanId=${legacy.razorpayPlanId}`)
  console.log(`vip-monthly current razorpayPlanId=${vip.razorpayPlanId}`)

  const legacyIsTarget = legacy.razorpayPlanId && !legacy.razorpayPlanId.includes('demo')
  const vipIsDemo = vip.razorpayPlanId.includes('demo')

  if (legacy.razorpayPlanId === vip.razorpayPlanId) {
    console.log('IDs already match; just deleting legacy row...')
    await prisma.membershipPlan.delete({ where: { id: legacy.id } })
    console.log('Deleted legacy MONTHLY row.')
    return
  }

  if (legacyIsTarget && vipIsDemo) {
    console.log('Swapping: assigning legacy planId to vip-monthly and deleting legacy row...')
    await prisma.membershipPlan.update({
      where: { id: vip.id },
      data: { razorpayPlanId: legacy.razorpayPlanId }
    })
    await prisma.membershipPlan.delete({ where: { id: legacy.id } })
    console.log('Updated vip-monthly and deleted legacy MONTHLY row.')
    return
  }

  console.log('Did not meet auto-swap conditions. No destructive action taken.')
  console.log('Conditions needed: legacy non-demo ID, vip-monthly still demo. Please inspect manually.')
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
