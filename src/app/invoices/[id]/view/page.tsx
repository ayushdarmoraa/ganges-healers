// Server component that resolves the invoice URL via resolveInvoiceUrl. If missing, notFound().
// Render a toolbar with Open/Download/Print and an <embed> PDF viewer. Add generateMetadata with noindex.

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveInvoiceUrl } from '@/lib/invoices/resolve'
import PrintButton from '@/components/invoices/PrintButton'
import { canonicalOf } from '@/config/site'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const canonical = canonicalOf(`/invoices/${id}/view`)
  return {
    title: `Invoice ${id} | Ganges Healers`,
    description: 'Print or download your invoice',
    alternates: { canonical },
    robots: { index: false, follow: false },
  }
}

export default async function InvoiceViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = await resolveInvoiceUrl(id)
  if (!url) return notFound()

  const safeUrl = `${url}#toolbar=0&navpanes=0`

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 focus-ring">Open PDF</a>
        <a href={`/api/invoices/${id}/download`} className="inline-flex items-center rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 focus-ring">Download</a>
        <PrintButton />
      </div>
      <div className="rounded-xl shadow overflow-hidden">
        <embed src={safeUrl} type="application/pdf" className="w-full h-[calc(100vh-8rem)]" title="Invoice PDF" data-testid="invoice-embed" />
      </div>
    </div>
  )
}
