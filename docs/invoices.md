# Invoices: Public Route, Generator, and Admin Trigger

- Public route contract
  - GET `/api/invoices/[id]`
  - 302 Redirect to PDF URL on success; 404 if not found
  - Lookup precedence (must not change):
    1) `Payment.invoiceUrl` (legacy fast path)
    2) `Payment.invoice.pdfUrl` (relation)
    3) `Invoice.pdfUrl` (by invoiceNumber or id)
  - No JSON body on success

- Viewer page (read-only)
  - Path: `/invoices/[id]/view`
  - Resolves via the exact same precedence (pure read-only; no generation)
  - Renders a simple toolbar: Open PDF, Download, Print; embeds the PDF with `<embed>`
  - Metadata: `noindex, nofollow`; canonical points to `/invoices/[id]/view`
  - No changes to existing API contracts

- Generator behavior
  - `createAndStoreInvoicePdf(lookupId, { force? })`
  - Idempotent:
    - If legacy `Payment.invoiceUrl` exists → early return (unless `force`)
    - If `Invoice` exists for payment → early return (unless `force`)
    - On generate: minimal `pdf-lib` PDF → upload to Vercel Blob → upsert `Invoice` → attempt legacy `Payment.invoiceUrl` patch (best-effort)
  - Logs: `[invoices][gen]` (`start_lookup`, `idempotent_skip`, `[error][pdf|upload|persist]`, `[done]`)

- Admin trigger
  - POST `/api/admin/invoices/generate` `{ id, force? }` → `{ url } | { error, detail }`
  - Logging: `[admin][invoices][generate]`

- Refunds feature flag (cross-ref Bookings)
  - `REFUNDS_ENABLED=false` → simulated `Refund` row only (if paid & eligible)
  - `REFUNDS_ENABLED=true` → real Razorpay refund with idempotency based on `(paymentId + amountPaise)`; stores `gatewayRefundId`

- Tests that pin contracts
  - `invoices.public.route.precedence.test.ts`
  - `invoices.generator.idempotency.test.ts`
