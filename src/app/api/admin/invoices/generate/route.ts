import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { createAndStoreInvoicePdf } from '@/lib/invoices'

// POST /api/admin/invoices/generate
// Body: { paymentId: string, force?: boolean }
// Generates (or returns existing) invoice PDF for a specific payment
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ error: e.message || 'forbidden' }, { status: e.status || 403 })
  }

  let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const paymentId = body?.paymentId
  const force: boolean = !!body?.force
  if (!paymentId || typeof paymentId !== 'string') {
    return NextResponse.json({ error: 'paymentId_required' }, { status: 400 })
  }

  try {
    const p = await prisma.payment.findFirst({
      where: {
        OR: [
          { paymentId },
          { gatewayPaymentId: paymentId },
          { id: paymentId },
          { orderId: paymentId },
          { gatewayOrderId: paymentId },
        ],
      },
      // invoiceUrl may exist in DB; selecting defensively (not in schema maybe)
      select: { id: true, paymentId: true, gatewayPaymentId: true },
    })
    if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    // Attempt raw query for invoiceUrl fast path
    let existingUrl: string | null = null
    try {
      const rows: Array<{ invoiceUrl: string | null }> = await prisma.$queryRaw`
        SELECT "invoiceUrl" FROM "Payment" WHERE "id" = ${p.id} LIMIT 1`
      existingUrl = rows?.[0]?.invoiceUrl || null
    } catch {/* ignore raw read errors */}

    if (existingUrl && !force) {
      console.log('[admin][invoices][generate] idempotent', { paymentId: p.id })
      return NextResponse.json({ url: existingUrl })
    }

    const targetId = p.paymentId || p.gatewayPaymentId || p.id
    const url = await createAndStoreInvoicePdf(targetId)
    if (!url) return NextResponse.json({ error: 'not_found_or_failed' }, { status: 400 })
    console.log('[admin][invoices][generate] created', { paymentId: p.id, url, force })
    return NextResponse.json({ url })
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[admin][invoices][generate][error]', { paymentId, error: err.message })
    return NextResponse.json({ error: 'generation_failed' }, { status: 400 })
  }
}
