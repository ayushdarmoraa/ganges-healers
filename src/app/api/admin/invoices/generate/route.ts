import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { createAndStoreInvoicePdf } from '@/lib/invoices'

// POST /api/admin/invoices/generate
// Body: { paymentId: string }
// Generates (or returns existing) invoice PDF for a specific payment
export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ error: e.message || 'forbidden' }, { status: e.status || 403 })
  }

  let body: any // eslint-disable-line @typescript-eslint/no-explicit-any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const paymentId = body?.paymentId
  if (!paymentId || typeof paymentId !== 'string') {
    return NextResponse.json({ error: 'paymentId_required' }, { status: 400 })
  }

  try {
    const url = await createAndStoreInvoicePdf(paymentId)
    if (!url) return NextResponse.json({ error: 'not_found_or_failed' }, { status: 400 })
    return NextResponse.json({ url })
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[admin][invoices][generate][error]', { paymentId, error: err.message })
    return NextResponse.json({ error: 'generation_failed' }, { status: 400 })
  }
}
