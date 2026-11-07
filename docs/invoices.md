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

- Viewer links in UI
  - Dashboard/Admin lists build links via precedence: invoiceNumber → paymentId → id
  - “View” opens in a new tab; “Copy link” copies the absolute URL
  - UI-only; no backend calls or behavior changes

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

- Booking refunds
  - Booking cancellation uses the saved booking and successful Razorpay payment
    amount to calculate the policy refund on the server.
  - A refund intent is stored before calling Razorpay. The API reports the
    provider state as pending, confirmed, failed, unavailable, or unknown; it
    never treats a simulated refund as completed.
  - Retries fetch a known Razorpay refund instead of issuing another request.
    If the request outcome is uncertain and no refund ID was received, automatic
    retries stop and the refund requires operational reconciliation.
  - Older cancelled bookings without a persisted refund intent are not refunded
    automatically because the earlier flow cannot prove whether Razorpay was
    already called. Support must verify the payment/refund in the Razorpay
    dashboard before taking action.
  - `REFUNDS_ENABLED` is no longer used; eligible cancellations attempt a real
    Razorpay refund when the gateway credentials are configured.

- Tests that pin contracts
  - `invoices.public.route.precedence.test.ts`
  - `invoices.generator.idempotency.test.ts`
