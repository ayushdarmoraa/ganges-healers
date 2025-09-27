import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'

// POST /api/admin/invoices/backfill
// Body: { chunkSize?: number, dryRun?: boolean }
// Scans successful payments without invoice (amount>0) and generates invoices in chunks.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const status = e.status || 403
    return NextResponse.json({ error: e.message }, { status })
  }
  const start = Date.now()
  const { chunkSize = 100, dryRun = false } = await req.json().catch(() => ({}))
  const take = Math.min(Number(chunkSize) || 100, 500)

  // Find candidate payments
  const payments = await prisma.payment.findMany({
    where: {
      amountPaise: { gt: 0 },
      OR: [ { status: 'success' }, { statusEnum: 'SUCCESS' } ],
      invoice: null
    },
    orderBy: { createdAt: 'asc' },
    take
  })

  let created = 0
  let skipped = 0
  const errors: Array<{ paymentId: string; error: string }> = []

  if (!dryRun) {
    for (const p of payments) {
      try {
        const res = await generateInvoiceForPayment({ paymentId: p.id, force: false, sendEmail: true })
        if (res.ok && !(res as any).idempotent) { // eslint-disable-line @typescript-eslint/no-explicit-any
          created++
        } else if ((res as any).idempotent) { // eslint-disable-line @typescript-eslint/no-explicit-any
          skipped++
        } else {
          skipped++
        }
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        errors.push({ paymentId: p.id, error: err.message })
      }
    }
  } else {
    skipped = payments.length
  }

  console.log('[invoice][backfill][run]', { dryRun, requested: take, scanned: payments.length, created, skipped, errors: errors.length, ms: Date.now() - start })
  return NextResponse.json({ dryRun, scanned: payments.length, created, skipped, errors })
}
