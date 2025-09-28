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
    // 1) Try by payment identifiers (supports both old/new names)
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { paymentId: id },
          { gatewayPaymentId: id },
          { orderId: id },
          { gatewayOrderId: id },
          { id }, // direct primary key match as last resort
        ],
      },
      select: { invoice: { select: { pdfUrl: true } } },
    })

    if (payment?.invoice?.pdfUrl) {
      return NextResponse.redirect(payment.invoice.pdfUrl, 302)
    }

    // 2) Fallback: maybe client passed an invoice number or invoice id
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { invoiceNumber: id },
          { id },
        ],
      },
      select: { pdfUrl: true },
    })

    if (invoice?.pdfUrl) {
      return NextResponse.redirect(invoice.pdfUrl, 302)
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch (err) {
    console.error('[invoices][lookup][error]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
