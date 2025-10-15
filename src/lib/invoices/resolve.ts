// Create resolveInvoiceUrl(id) that returns the first URL found using precedence:
// Payment.invoiceUrl → Payment.invoice.pdfUrl → Invoice.pdfUrl (invoiceNumber or invoice id).
// Pure read-only; no writes; no generation.

import { prisma } from '@/lib/prisma'

/**
 * Resolve a hosted invoice PDF URL by flexible identifier without any side-effects.
 * Accepted identifiers: paymentId, gatewayPaymentId, orderId, gatewayOrderId, Payment.id,
 * Invoice.invoiceNumber, or Invoice.id.
 *
 * Precedence (must remain stable):
 * 1) Payment.invoiceUrl (legacy fast path via raw SQL)
 * 2) Payment.invoice.pdfUrl (relation lookup)
 * 3) Invoice.pdfUrl by invoiceNumber or id
 */
export async function resolveInvoiceUrl(id: string): Promise<string | null> {
  const lookup = (id ?? '').toString()
  if (!lookup) return null

  // 1) Fast path: raw SQL direct lookup of Payment.invoiceUrl (column may exist even if not in Prisma model)
  try {
    const rows: Array<{ invoiceUrl: string | null }> = await prisma.$queryRaw`
      SELECT "invoiceUrl"
      FROM "Payment"
      WHERE "paymentId" = ${lookup}
         OR "gatewayPaymentId" = ${lookup}
         OR "orderId" = ${lookup}
         OR "gatewayOrderId" = ${lookup}
         OR "id" = ${lookup}
      LIMIT 1
    `
    const url = rows?.[0]?.invoiceUrl
    if (url) return url
  } catch {
    // ignore raw read errors; continue with relation-based fallback
  }

  // 2) Relation on Payment → Invoice.pdfUrl (supports both old/new payment identifier names)
  try {
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { paymentId: lookup },
          { gatewayPaymentId: lookup },
          { orderId: lookup },
          { gatewayOrderId: lookup },
          { id: lookup },
        ],
      },
      select: { invoice: { select: { pdfUrl: true } } },
    })
    const url = payment?.invoice?.pdfUrl || null
    if (url) return url
  } catch {
    // ignore and continue
  }

  // 3) Direct Invoice lookup by invoiceNumber or id
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { OR: [{ invoiceNumber: lookup }, { id: lookup }] },
      select: { pdfUrl: true },
    })
    if (invoice?.pdfUrl) return invoice.pdfUrl
  } catch {
    // ignore and fall through
  }

  return null
}
