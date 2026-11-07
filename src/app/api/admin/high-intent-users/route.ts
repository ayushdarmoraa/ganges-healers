import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/high-intent-users?minScore=60&limit=50
 *
 * Returns quiz leads with high engagement scores who have NOT purchased.
 * This is the most valuable re-engagement dataset.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const minScore = Math.max(Number(searchParams.get('minScore')) || 60, 1)
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)

  try {
    // 1. Get high-score leads
    const leads = await prisma.quizLead.findMany({
      where: { score: { gte: minScore } },
      orderBy: { score: 'desc' },
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        chakra: true,
        intention: true,
        score: true,
        createdAt: true,
      },
    })

    if (leads.length === 0) {
      return NextResponse.json({ users: [], total: 0 })
    }

    // 2. Check which of these emails have a completed order (exclude purchasers)
    const emails = leads.map((l) => l.email)

    // Find users who have placed orders
    const usersWithOrders = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, orders: { where: { status: { not: 'pending_payment' } }, select: { id: true }, take: 1 } },
    })
    const purchasedEmails = new Set(
      usersWithOrders.filter((u) => u.orders.length > 0).map((u) => u.email),
    )

    const nonPurchasers = leads.filter((l) => !purchasedEmails.has(l.email))

    // 3. For each non-purchaser, find their last funnel event
    const lastEvents = await Promise.all(
      nonPurchasers.map(async (lead) => {
        const lastEvent = await prisma.funnelEvent.findFirst({
          where: {
            OR: [
              { metadata: { path: ['email'], equals: lead.email } },
              // Also check via userId if they have an account
              ...(lead.email
                ? [{ userId: { not: null } } as const]
                : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { type: true, createdAt: true },
        })
        return { leadId: lead.id, lastEvent }
      }),
    )

    const lastEventMap = new Map(
      lastEvents.map((le) => [le.leadId, le.lastEvent]),
    )

    const users = nonPurchasers.map((lead) => {
      const lastEvent = lastEventMap.get(lead.id)
      return {
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        chakra: lead.chakra,
        intention: lead.intention,
        score: lead.score,
        quizDate: lead.createdAt,
        lastEventType: lastEvent?.type ?? null,
        lastEventAt: lastEvent?.createdAt ?? null,
      }
    })

    return NextResponse.json({
      users,
      total: users.length,
      minScore,
    })
  } catch (err) {
    console.error('[high-intent-users] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
