import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Flexible invoice lookup by multiple possible identifiers:
// - paymentId / gatewayPaymentId (new naming)
// - orderId / gatewayOrderId
// - invoiceNumber or invoice id (Invoice table)
// Redirects to hosted invoice URL if found, else 404 JSON.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    // Fast path: raw SQL direct lookup of Payment.invoiceUrl (column exists in DB but not in Prisma model)
    try {
      const rows: Array<{ invoiceUrl: string | null }> = await prisma.$queryRaw`
        SELECT "invoiceUrl"
        FROM "Payment"
        WHERE "paymentId" = ${id}
           OR "gatewayPaymentId" = ${id}
           OR "orderId" = ${id}
           OR "gatewayOrderId" = ${id}
           OR "id" = ${id}
        LIMIT 1
      `
      const url = rows?.[0]?.invoiceUrl
      if (url) {
        console.log('[invoices][lookup] redirecting to invoiceUrl', { id })
        return NextResponse.redirect(url, 302)
      }
    } catch (rawErr) {
      console.warn('[invoices][lookup][raw_fallback_failed]', rawErr)
    }

    // 1) Try by payment identifiers (supports both old/new names)
  type PaymentLookup = { invoiceUrl?: string | null; invoice?: { pdfUrl: string | null } | null }
    const paymentRaw = await prisma.payment.findFirst({
      where: {
        OR: [
          { paymentId: id },
          { gatewayPaymentId: id },
          { orderId: id },
          { gatewayOrderId: id },
          { id },
        ],
      },
  // NOTE: Payment.invoiceUrl not present in current Prisma model; if added later, update select.
  select: { invoice: { select: { pdfUrl: true } } },
    })
    const payment = paymentRaw as unknown as PaymentLookup | null

    if (payment?.invoice?.pdfUrl) {
      return NextResponse.redirect(payment.invoice.pdfUrl, 302)
    }

    // 2) Fallback: maybe client passed an invoice number or invoice id
    const invoice = await prisma.invoice.findFirst({
      where: { OR: [{ invoiceNumber: id }, { id }] },
      select: { pdfUrl: true },
    })
    if (invoice?.pdfUrl) return NextResponse.redirect(invoice.pdfUrl, 302)

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (err) {
    console.error('[invoices][lookup][error]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
