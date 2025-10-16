export type InvoiceLike = {
  invoiceNumber?: string | null
  paymentId?: string | null
  id?: string | null
}

/**
 * Build the Invoice Viewer href using preferred identifier order:
 * invoiceNumber → paymentId → id
 * Returns /invoices/<id>/view
 * Throws if no identifier is present.
 * Pure helper: no fetch, no logs.
 */
export function invoiceViewerHref(x: InvoiceLike): string {
  const raw = (x.invoiceNumber ?? x.paymentId ?? x.id)?.toString().trim()
  if (!raw) throw new Error('invoiceViewerHref: missing identifier (invoiceNumber | paymentId | id)')
  return `/invoices/${encodeURIComponent(raw)}/view`
}
