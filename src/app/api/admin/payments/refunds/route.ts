import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { parseRange } from '@/lib/time-range'

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const { searchParams } = new URL(req.url)
  const { from, to } = parseRange(searchParams.get('from'), searchParams.get('to'))
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
  const refunds = await prisma.refund.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, amountPaise: true, createdAt: true, paymentId: true }
  })
  const ms = Date.now()-t0
  const logMeta = { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), limit, ms }
  if (ms > 400) console.warn('[admin][payments][refunds][slow]', logMeta)
  else console.log('[admin][payments][refunds]', logMeta)
  return NextResponse.json({ items: refunds })
}