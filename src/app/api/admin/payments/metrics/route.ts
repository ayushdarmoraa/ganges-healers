import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { parseRange } from '@/lib/time-range'
import { ensureByTypeKeys } from '@/lib/admin/metrics-constants'

// Keys are normalized via ensureByTypeKeys

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  try { await requireAdmin() } catch (e) {
    const msg = e instanceof Error ? e.message : 'forbidden'
    const status = (e as any)?.status || 403 // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ error: msg }, { status })
  }
  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const typeFilter = searchParams.get('type') // ALL | SESSION | PROGRAM | MEMBERSHIP | STORE | COURSE
  const { from, to } = parseRange(fromStr, toStr)

  const paymentWhere: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    createdAt: { gte: from, lte: to },
    statusEnum: 'SUCCESS'
  }
  if (typeFilter && typeFilter !== 'ALL') paymentWhere.type = typeFilter

  // Payments in range (success only)
  const payments = await prisma.payment.findMany({
    where: paymentWhere,
    select: { amountPaise: true, type: true, metadata: true }
  })
  const refunds = await prisma.refund.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { amountPaise: true }
  })

  let gross = 0
  const byTypeRaw: Record<string, number> = {}
  for (const p of payments) {
    gross += p.amountPaise
    const key = (p.type || 'OTHER') as string
    byTypeRaw[key] = (byTypeRaw[key] || 0) + p.amountPaise
  }
  const refundsSum = refunds.reduce((a: number,r:{amountPaise:number})=>a+r.amountPaise,0)
  const net = gross - refundsSum
  const paymentsCount = payments.length
  const refundsCount = refunds.length
  const aov = paymentsCount ? Math.round(gross / paymentsCount) : 0

  // MRR: active memberships (monthly + yearly/12)
  const activeMemberships = await prisma.vIPMembership.findMany({
    where: { status: 'active' },
    include: { plan: true }
  })
  let mrr = 0
  for (const m of activeMemberships) {
    if (m.plan.interval === 'MONTHLY') mrr += m.plan.pricePaise
    else if (m.plan.interval === 'YEARLY') mrr += Math.round(m.plan.pricePaise / 12)
  }

  // Top programs by revenue via metadata.programId
  const programRevenue: Record<string, number> = {}
  for (const p of payments) {
    const programId = (p.metadata as any)?.programId // eslint-disable-line @typescript-eslint/no-explicit-any
    if (programId && p.type === 'PROGRAM') {
      programRevenue[programId] = (programRevenue[programId] || 0) + p.amountPaise
    }
  }
  const programIds = Object.keys(programRevenue)
  let programs: Array<{ programId: string; title: string; grossPaise: number }> = []
  if (programIds.length) {
    const rows = await prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } })
    programs = rows
      .map((r: {id:string; title:string}) => ({ programId: r.id, title: r.title, grossPaise: programRevenue[r.id] }))
      .sort((a: {grossPaise:number}, b: {grossPaise:number}) => b.grossPaise - a.grossPaise)
      .slice(0,5)
  }

  // Normalize to stable keys; even when filtered, keep all keys present
  const byType = ensureByTypeKeys(byTypeRaw)

  const responseBody = {
    range: { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) },
    kpi: {
      grossPaise: gross,
      refundsPaise: refundsSum,
      netPaise: net,
      paymentsCount,
      refundsCount,
      aovPaise: aov,
      mrrPaise: mrr
    },
    byType,
    topPrograms: programs
  }
  const ms = Date.now()-t0
  const logMeta = { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), type: typeFilter || 'ALL', ms }
  if (ms > 400) console.warn('[admin][payments][metrics][slow]', logMeta)
  else console.log('[admin][payments][metrics]', logMeta)
  return NextResponse.json(responseBody)
}