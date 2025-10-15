import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CANONICAL_SLUGS } from '@/lib/memberships/slug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const rows = await prisma.membershipPlan.findMany({
      where: { isActive: true, slug: { in: [...CANONICAL_SLUGS] } },
      orderBy: { pricePaise: 'asc' },
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
  const freeSessionsRaw = (benefits as Record<string, unknown>).freeSessions
  const fs = Number(freeSessionsRaw ?? 0)
  ;(benefits as Record<string, unknown>).freeSessions = Number.isFinite(fs) ? fs : 0
      return {
        slug: r.slug,
        title: r.title,
        pricePaise: r.pricePaise,
        interval: r.interval,
        benefits
      }
    })
    // Contract pin: expect exactly two canonical plans; log drift but return whatever matched
  const slugs: string[] = plans.map(p => p.slug)
  const expected = new Set<string>(CANONICAL_SLUGS as readonly string[])
  const drift = slugs.length !== CANONICAL_SLUGS.length || slugs.some(s => !expected.has(s))
    if (drift) {
      console.warn('[membership][plans][contract]', { slugs, expected: [...CANONICAL_SLUGS] })
    }
    return NextResponse.json({ plans })
  } catch (err) {
    console.error('[membership][plans][error]', err)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
