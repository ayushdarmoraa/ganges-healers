import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const rows = await prisma.membershipPlan.findMany({
      where: { isActive: true, slug: { in: ['vip-monthly', 'vip-yearly'] } },
      orderBy: { pricePaise: 'asc' }
    })
    const plans = rows.map(r => {
      const raw = r.benefits as any // eslint-disable-line @typescript-eslint/no-explicit-any
      let benefits: Record<string, unknown> = {}
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        benefits = raw
      } else if (Array.isArray(raw)) {
        // attempt to pull a number from first element e.g. "2 free sessions"
        const free = Number(String(raw[0]).match(/\d+/)?.[0] ?? 0)
        benefits = { freeSessions: free }
      } else {
        benefits = { freeSessions: 0 }
      }
      if (benefits.freeSessions == null) {
        benefits.freeSessions = 0
      }
      return {
        slug: r.slug,
        title: r.title,
        pricePaise: r.pricePaise,
        interval: r.interval,
        benefits
      }
    })
    return NextResponse.json({ plans })
  } catch (err) {
    console.error('[membership][plans][error]', err)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
