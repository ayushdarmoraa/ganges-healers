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

export async function createAndStoreInvoicePdf(paymentId: string): Promise<string | null> {
  // Load payment with relations; support both booking+service or generic payments
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { paymentId },
        { gatewayPaymentId: paymentId },
        { id: paymentId },
      ]
    },
    include: {
      user: true,
      booking: { include: { service: true } },
    }
  })
  if (!payment) return null

  // If already has invoiceUrl column in DB via raw query, try to read it (defensive)
  // We cannot select it via Prisma if not in schema; rely on separate update logic below.

  // Idempotency check: existing Invoice row?
  const existing = await prisma.invoice.findFirst({ where: { paymentId: payment.id } })
  if (existing) return existing.pdfUrl

  const data = formatInvoiceData(payment as unknown as PaymentLike)

  // Create PDF
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  let y = 800
  const write = (text: string, size = 12) => { page.drawText(text, { x: 40, y, size, font }); y -= size + 8 }
  write('Ganges Healers', 20)
  write(`Invoice #: ${data.invoiceNumber}`)
  write(`Date: ${data.dateISO}`)
  write(`Customer: ${data.customerName} <${data.customerEmail}>`)
  write(`Service: ${data.serviceTitle}`)
  write(`Amount: ${data.totalFormatted}`)
  write('Thank you for your purchase!')
  const pdfBytes = await pdfDoc.save()

  const path = `invoices/${data.invoiceNumber}.pdf`
  const envObj: Record<string, string | undefined> = process.env as Record<string, string | undefined>
  const token = envObj.BLOB_READ_WRITE_TOKEN || envObj.BLOBD55__READ_WRITE_TOKEN || undefined
  const buffer = Buffer.from(pdfBytes)
  const { url } = await put(path, buffer, { access: 'public', token })

  // Persist invoice row (idempotent upsert logic)
  await prisma.invoice.create({
    data: {
      paymentId: payment.id,
      invoiceNumber: data.invoiceNumber,
      billTo: { name: data.customerName, email: data.customerEmail },
      lineItems: [{ description: data.serviceTitle, amountPaise: data.amountPaise }],
      subtotalPaise: data.amountPaise,
      totalPaise: data.amountPaise,
      pdfUrl: url,
      taxPaise: 0,
    }
  })

  return url
}
