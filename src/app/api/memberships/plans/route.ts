import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const plans = await prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { pricePaise: 'asc' } })
    return NextResponse.json({ plans: plans.map(p => ({ slug: p.slug, title: p.title, pricePaise: p.pricePaise, interval: p.interval, benefits: p.benefits })) })
  } catch (err) {
    console.error('[membership][plans][error]', err)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
