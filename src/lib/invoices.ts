import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { put } from '@vercel/blob'

export interface InvoicePDFData {
  invoiceNumber: string
  dateISO: string
  customerName: string
  customerEmail: string
  serviceTitle: string
  amountPaise: number
  currency: string
  totalFormatted: string
}

interface PaymentLike {
  id: string
  paymentId?: string | null
  gatewayPaymentId?: string | null
  amountPaise?: number | null
  currency?: string | null
  user?: { name?: string | null; email?: string | null } | null
  booking?: { service?: { name?: string | null; title?: string | null } | null } | null
}

export function formatInvoiceData(payment: PaymentLike): InvoicePDFData {
  const user = payment.user || {}
  const booking = payment.booking || {}
  const service = booking.service || {}
  const invoiceNumber = payment.paymentId || payment.gatewayPaymentId || payment.id
  const amountPaise = payment.amountPaise || 0
  const currency = (payment.currency || 'INR').toUpperCase()
  return {
    invoiceNumber,
    dateISO: new Date().toISOString(),
    customerName: user.name || 'Customer',
    customerEmail: user.email || 'unknown@example.com',
    serviceTitle: service.name || service.title || 'Service',
    amountPaise,
    currency,
    totalFormatted: `${currency} ${(amountPaise / 100).toFixed(2)}`,
  }
}

export async function createAndStoreInvoicePdf(lookupId: string, opts?: { force?: boolean }): Promise<string | null> {
  // Raw flexible lookup (legacy-safe). Using $queryRawUnsafe with parameter binding simulation.
  console.log('[invoices][gen] start_lookup', { lookupId })
  interface RawPaymentRow { id: string; paymentId?: string | null; gatewayPaymentId?: string | null; orderId?: string | null; gatewayOrderId?: string | null; userId?: string | null; bookingId?: string | null; amountPaise?: number | null; currency?: string | null; invoiceUrl?: string | null }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, "paymentId", "gatewayPaymentId", "orderId", "gatewayOrderId", "userId", "bookingId", "amountPaise", currency, "invoiceUrl"
     FROM "Payment"
     WHERE $1 IN ("paymentId","gatewayPaymentId","orderId","gatewayOrderId","id")
     LIMIT 1`,
    lookupId
  )
  const arr: RawPaymentRow[] = Array.isArray(rows) ? rows as RawPaymentRow[] : []
  const row = arr[0]
  if (!row) throw new Error('PAYMENT_NOT_FOUND')

  console.log('[invoices][gen] row_fetched', {
    lookupId,
    paymentId: row.id,
    hasInvoiceUrl: !!row.invoiceUrl,
    userId: row.userId,
    bookingId: row.bookingId,
    amountPaise: row.amountPaise ?? 0,
    currency: row.currency || 'INR',
    force: !!opts?.force
  })

  if (row.invoiceUrl && !opts?.force) {
    console.log('[invoices][gen] idempotent_existing_payment_invoiceUrl', { lookupId, paymentId: row.id })
    return row.invoiceUrl
  }

  // Idempotency via existing Invoice record
  const existingInvoice = await prisma.invoice.findFirst({ where: { paymentId: row.id } })
  if (existingInvoice && !opts?.force) {
    console.log('[invoices][gen] idempotent_existing_invoice_row', { lookupId, paymentId: row.id })
    return existingInvoice.pdfUrl
  }

  // Optional related data (defensive)
  const user = row.userId ? await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true, email: true } }) : null
  if (!user && row.userId) console.warn('[invoices][gen][context][missing_user]', { lookupId, userId: row.userId })
  const booking = row.bookingId ? await prisma.booking.findUnique({ where: { id: row.bookingId }, select: { serviceId: true } }) : null
  if (!booking && row.bookingId) console.warn('[invoices][gen][context][missing_booking]', { lookupId, bookingId: row.bookingId })
  const service = booking?.serviceId ? await prisma.service.findUnique({ where: { id: booking.serviceId }, select: { name: true } }) : null
  if (!service && booking?.serviceId) console.warn('[invoices][gen][context][missing_service]', { lookupId, serviceId: booking.serviceId })
  console.log('[invoices][gen] context', {
    lookupId,
    paymentId: row.id,
    hasUser: !!user,
    hasBooking: !!booking,
    hasService: !!service
  })

  const invoiceNumber = row.paymentId || row.gatewayPaymentId || lookupId
  const amountPaise: number = typeof row.amountPaise === 'number' ? row.amountPaise : 0
  const currency = (row.currency || 'INR').toUpperCase()
  const customerName = user?.name || 'Customer'
  const customerEmail = user?.email || 'unknown@example.com'
  const serviceTitle = service?.name || 'Session'

  console.log('[invoices][gen] start_pdf', { lookupId, invoiceNo: invoiceNumber })
  let pdfBytes: Uint8Array
  try {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const page = pdfDoc.addPage([595.28, 841.89])
    let y = 800
    const write = (text: string, size = 12) => { page.drawText(text, { x: 40, y, size, font }); y -= size + 8 }
    write('Ganges Healers', 20)
    write(`Invoice #: ${invoiceNumber}`)
    write(`Date: ${new Date().toISOString()}`)
    write(`Customer: ${customerName} <${customerEmail}>`)
    write(`Service: ${serviceTitle}`)
    write(`Amount: ${currency} ${(amountPaise / 100).toFixed(2)}`)
    write('Thank you for your purchase!')
    pdfBytes = await pdfDoc.save()
  } catch (e) {
    console.error('[invoices][gen][error][pdf]', lookupId, e)
    throw e
  }

  const envEntries = Object.entries(process.env as Record<string, string | undefined>)
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || envEntries.find(([k]) => /^BLOB\w+__READ_WRITE_TOKEN$/.test(k))?.[1]
  const path = `invoices/${invoiceNumber}.pdf`
  const buffer = Buffer.from(pdfBytes)
  let url: string
  try {
    const putResult = await put(path, buffer, { access: 'public', token: blobToken })
    url = putResult.url
  } catch (e) {
    console.error('[invoices][gen][error][upload]', lookupId, e)
    throw e
  }

  try {
    await prisma.invoice.upsert({
      where: { paymentId: row.id },
      update: { pdfUrl: url, totalPaise: amountPaise, subtotalPaise: amountPaise },
      create: {
        paymentId: row.id,
        invoiceNumber,
        billTo: { name: customerName, email: customerEmail },
        lineItems: [{ description: serviceTitle, amountPaise }],
        subtotalPaise: amountPaise,
        totalPaise: amountPaise,
        pdfUrl: url,
        taxPaise: 0,
      }
    })
  } catch (e) {
    console.error('[invoices][gen][error][persist]', lookupId, e)
    // Still return URL since PDF exists and was uploaded
  }

  // Try to persist invoiceUrl column if it exists (ignore failure)
  try { await prisma.$executeRawUnsafe(`UPDATE "Payment" SET "invoiceUrl" = $1 WHERE id = $2`, url, row.id) } catch (e) { console.warn('[invoices][gen][warn][persist_invoiceUrl]', { lookupId, paymentId: row.id, error: (e as Error).message }) }
  console.log('[invoices][gen][done]', { lookupId, paymentId: row.id, url, force: !!opts?.force })
  return url
}
