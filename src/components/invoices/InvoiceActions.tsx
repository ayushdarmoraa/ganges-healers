"use client"

import Link from 'next/link'
import { toast } from 'sonner'
import { invoiceViewerHref, type InvoiceLike } from '@/lib/invoices/viewer-link'

export function InvoiceActions({ inv }: { inv: InvoiceLike }) {
  const href = invoiceViewerHref(inv)

  const onCopy = async () => {
    try {
      const abs = new URL(href, window.location.origin).toString()
      await navigator.clipboard.writeText(abs)
      toast.success('Link copied')
    } catch {
      toast.error?.('Failed to copy link')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/60"
      >
        View
      </Link>
      <button
        type="button"
        aria-label="Copy invoice link"
        onClick={onCopy}
        className="inline-flex items-center rounded-md px-2 py-1.5 text-sm font-medium bg-muted text-foreground hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/60"
      >
        Copy link
      </button>
    </div>
  )
}

export default InvoiceActions
