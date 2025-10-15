import { prisma } from '@/lib/prisma'
import { generateInvoicePDF } from './pdf'
import { uploadInvoicePDF } from './storage'
import crypto from 'crypto'
import { emailService } from '@/lib/email/email.service'

interface GenerateArgs {
  paymentId: string
  force?: boolean
  sendEmail?: boolean
}

function buildInvoiceNumber(date: Date) {
  const yyyymmdd = date.toISOString().slice(0,10).replace(/-/g,'')
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `INV-${yyyymmdd}-${rand}`
}

export async function generateInvoiceForPayment(args: GenerateArgs) {
  const { paymentId, force, sendEmail = true } = args
  console.log('[invoice][generate][start]', { paymentId, force })
  // Idempotency: legacy Payment.invoiceUrl fast path via raw SQL (column exists but not in Prisma model)
  if (!force) {
    try {
      const rows: Array<{ invoiceUrl: string | null }> = await prisma.$queryRaw`
        SELECT "invoiceUrl" FROM "Payment" WHERE "id" = ${paymentId} LIMIT 1
      `
      const legacyUrl = rows?.[0]?.invoiceUrl
      if (legacyUrl) {
        console.log('[invoice][generate][idempotent_legacy]', { paymentId })
        return { ok: true, idempotent: true, url: legacyUrl }
      }
    } catch (e) {
      console.warn('[invoice][generate][legacy_lookup_failed]', { paymentId, error: (e as Error).message })
    }
  }
  // Fetch payment with related context
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: true,
      booking: { include: { service: true, user: true } }
    }
  })
  if (!payment) {
    console.warn('[invoice][generate][missing_payment]', { paymentId })
    return { ok: false, reason: 'payment_not_found' }
  }
  const amount = payment.amountPaise
  if (amount <= 0) {
    console.log('[invoice][generate][skipped_zero_amount]', { paymentId })
    return { ok: false, reason: 'zero_amount' }
  }
  const isSuccess = payment.status === 'success' || payment.statusEnum === 'SUCCESS'
  if (!isSuccess && !force) {
    console.log('[invoice][generate][skipped_not_success]', { paymentId, status: payment.status, statusEnum: payment.statusEnum })
    return { ok: false, reason: 'not_success' }
  }

  // Idempotency check and force-aware reuse
  const existingInvoice = await prisma.invoice.findUnique({ where: { paymentId } })
  if (existingInvoice && !force) {
    console.log('[invoice][generate][idempotent_hit]', { paymentId, invoiceNumber: existingInvoice.invoiceNumber })
    return { ok: true, idempotent: true, invoice: existingInvoice, url: existingInvoice.pdfUrl }
  }

  // Build line items & billTo
  const billToName = payment.user?.name || payment.booking?.user?.name || 'Customer'
  const billToEmail = payment.user?.email || payment.booking?.user?.email || 'unknown@example.com'
  let description = 'Payment'
  if (payment.booking?.service?.name) description = `${payment.booking.service.name} Session`
  else if (payment.type === 'PROGRAM') description = 'Program Purchase'
  else if (payment.type === 'MEMBERSHIP') description = 'VIP Membership Subscription'

  const lineItems = [ { description, amountPaise: amount } ]
  const subtotalPaise = amount
  const taxPaise = 0 // MVP – future: derive GST if needed
  const totalPaise = subtotalPaise + taxPaise
  const issuedAt = new Date()

  // Create or reuse invoice DB record (without pdfUrl yet)
  let invoiceRecord = existingInvoice ?? null
  if (!invoiceRecord) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const invoiceNumber = buildInvoiceNumber(issuedAt)
      try {
        invoiceRecord = await prisma.invoice.create({
          data: {
              paymentId,
              invoiceNumber,
              issuedAt,
              billTo: { name: billToName, email: billToEmail },
              lineItems,
              subtotalPaise,
              taxPaise,
              totalPaise,
              pdfUrl: ''
          }
        })
        break
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (err.code === 'P2002' && err.meta?.target?.includes('invoiceNumber')) { // unique invoice number
          console.warn('[invoice][generate][invoice_number_collision]', { attempt, paymentId })
          continue
        }
        if (err.code === 'P2002' && err.meta?.target?.includes('paymentId')) {
          const existing = await prisma.invoice.findUnique({ where: { paymentId } })
          if (existing) {
            console.log('[invoice][generate][race_lost]', { paymentId })
            return { ok: true, idempotent: true, invoice: existing, url: existing.pdfUrl }
          }
        }
        console.error('[invoice][generate][create_failed]', { paymentId, error: err.message })
        return { ok: false, reason: 'create_failed', error: err }
      }
    }
    if (!invoiceRecord) {
      console.error('[invoice][generate][exhausted_retries]', { paymentId })
      return { ok: false, reason: 'retries_exhausted' }
    }
  }

  // Generate PDF
  let pdfUrl = ''
  try {
    const pdf = await generateInvoicePDF({
      invoiceNumber: invoiceRecord.invoiceNumber,
      issuedAt,
      billTo: { name: billToName, email: billToEmail },
      lineItems,
      subtotalPaise,
      taxPaise,
      totalPaise
    })
    const upload = await uploadInvoicePDF({ invoiceNumber: invoiceRecord.invoiceNumber, issuedAt, paymentId, pdf, force })
    pdfUrl = upload.url
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.warn('[invoice][generate][pdf_failed]', { paymentId, error: err.message })
  }

  if (pdfUrl) {
    try {
      invoiceRecord = await prisma.invoice.update({ where: { id: invoiceRecord.id }, data: { pdfUrl } })
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.warn('[invoice][generate][db_update_pdf_failed]', { paymentId, error: err.message })
    }
  }

  if (sendEmail && pdfUrl) {
    emailService.sendInvoiceEmail({
      to: billToEmail,
      invoiceNumber: invoiceRecord.invoiceNumber,
      amountPaise: totalPaise,
      link: pdfUrl
    }).catch(e => console.warn('[invoice][generate][email_async_failed]', { paymentId, error: (e as Error).message }))
  }

  console.log('[invoice][generate][created]', { paymentId, invoiceNumber: invoiceRecord.invoiceNumber, pdf: !!pdfUrl })
  return { ok: true, invoice: invoiceRecord, url: invoiceRecord.pdfUrl }
}
