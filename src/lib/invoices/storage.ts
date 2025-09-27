import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'

interface UploadArgs {
  invoiceNumber: string
  paymentId: string
  pdf: Uint8Array | Buffer
  force?: boolean
}

function buildPath(invoiceNumber: string, issuedAt: Date) {
  const yyyy = issuedAt.getFullYear()
  const mm = String(issuedAt.getMonth() + 1).padStart(2, '0')
  return `invoices/${yyyy}/${mm}/${invoiceNumber}.pdf`
}

export async function uploadInvoicePDF(args: UploadArgs & { issuedAt: Date }): Promise<{ url: string; skipped: boolean; path: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('[invoice][generate][upload_skipped_no_token]', { paymentId: args.paymentId })
    return { url: '', skipped: true, path: '' }
  }
  // Idempotency: check existing invoice row
  if (!args.force) {
    const existing = await prisma.invoice.findUnique({ where: { paymentId: args.paymentId } })
    if (existing?.pdfUrl) {
      console.log('[invoice][generate][skipped_idempotent]', { paymentId: args.paymentId, invoiceNumber: existing.invoiceNumber })
      return { url: existing.pdfUrl, skipped: true, path: '' }
    }
  }
  const path = buildPath(args.invoiceNumber, args.issuedAt)
  try {
    const body: Buffer = Buffer.isBuffer(args.pdf) ? args.pdf : Buffer.from(args.pdf)
    const blob = await put(path, body, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    console.log('[invoice][generate][uploaded]', { paymentId: args.paymentId, invoiceNumber: args.invoiceNumber, path })
    return { url: blob.url, skipped: false, path }
  } catch (err) {
    console.warn('[invoice][generate][upload_failed]', { paymentId: args.paymentId, invoiceNumber: args.invoiceNumber, error: (err as Error).message })
    return { url: '', skipped: false, path }
  }
}
