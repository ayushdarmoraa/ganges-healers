import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = session.user.id

    const membership = await prisma.vIPMembership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true }
    })

    let creditsTotal = 0
    if (membership) {
      const credits = await prisma.sessionCredit.aggregate({
        where: { userId, membershipId: membership.id },
        _sum: { credits: true }
      })
      creditsTotal = credits._sum.credits || 0
    }

    return NextResponse.json({
      membership: membership ? {
        id: membership.id,
        status: membership.status,
        startDate: membership.startDate,
        nextBillingAt: membership.nextBillingAt,
        endDate: membership.endDate,
        plan: membership.plan ? {
          title: membership.plan.title,
          pricePaise: membership.plan.pricePaise,
          interval: membership.plan.interval
        } : null
      } : null,
      credits: { total: creditsTotal }
    })
  } catch (err) {
    console.error('[membership][me][error]', err)
    return NextResponse.json({ error: 'Failed to load membership' }, { status: 500 })
  }
}
