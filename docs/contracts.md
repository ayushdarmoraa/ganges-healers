# Ganges Healers — Contracts & Invariants (Living Doc)

This living document pins the repo’s public API contracts, HTTP headers, logging keys, database invariants, and environment variable behaviors. Changes to any item below require an explicit Patch Plan, updated tests, and reviewer approval per `docs/GUARDRAILS.md`.

## Scope

- Public API endpoints, methods, status codes, and response shapes
- Required/optional headers and cache semantics
- Stable logging prefixes and key fields used in observability and tests
- Database uniqueness/index invariants that guarantee idempotency and performance
- Environment variables and the exact behavior when they are absent/misconfigured

---

## Public APIs: Contracts to Preserve

### Payments Webhook (Razorpay)
- Path: `POST /api/payments/webhook`
- Behavior:
  - Reads raw request body; computes HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`
  - If signature mismatch: `401 { ok: false, error: 'signature-mismatch' }`
  - If secret missing: `500 { ok: false, error: 'secret-missing' }`
  - On success: `200 { ok: true }` and a log line: `[webhook] verified` with `{ type, subId, payId }`
  - No database side-effects unless `PAYMENT_EVENTS_ENABLED === 'true'` (gated, idempotent)

### Membership Plans
- Path: `GET /api/memberships/plans`
- Returns: `{ plans: [ { slug, title, pricePaise, interval, benefits } ] }`
- Canonical slugs only (from code-defined set). If DB returns drift, handler logs `[membership][plans][contract]` with `{ slugs, expected }`.
- `benefits.freeSessions` must be a number (coerced from JSON/array when necessary).

### Membership Subscribe
- Path: `POST /api/memberships/subscribe?dry=1|diag=1`
- Body: `{ planSlug: string, dry?: boolean }`
- Contract:
  - Unknown or unconfigured plan → `400 { error: 'unknown-plan' | 'Unknown or unconfigured plan', canonical?, planId? }`
  - Dry-run: `{ marker: 'SUBSCRIBE_V3', canonical, planId, keyPrefix?, keyMode, dry: true }`
  - `diag=1`: attempts plan fetch and returns diagnostic; on failure returns 400 with `{ error: 'Plan not accessible for current key' }`
  - Live (create): `200 { id, shortUrl }` on success; `500 { error: 'Subscription initiation failed', errorDetail }` on failure
- Logging keys: `[membership][subscribe][creation_failed|unhandled]` with `{ planId, keyMode, message, status }`

### Invoices: Public Download
- Path: `GET /api/invoices/[id]/download`
- Resolution precedence (read-only, no writes):
  1) `Payment.invoiceUrl` (legacy fast path via raw SQL)
  2) `Payment.invoice.pdfUrl` (relation)
  3) `Invoice.pdfUrl` (lookup by `invoiceNumber` or `id`)
- Success: streams upstream PDF body with headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline|attachment; filename="invoice-{id}.pdf"` (controlled by `?inline=1`)
  - `Cache-Control: no-store`
- Errors: `404 { error: 'not-found' }`, `502 { error: 'fetch-failed' }`

### Invoices: Viewer Page
- Path: `GET /invoices/[id]/view`
- Resolves URL with the same precedence as download; `404` if unresolved
- Embeds `/api/invoices/[id]/download?inline=1#toolbar=0&navpanes=0`
- Metadata: canonical to viewer path; robots `noindex, nofollow`

### Generic Payments (Unified)
- Endpoints (as documented and tested):
  - `POST /api/payments/create-order` (booking or generic type + amountPaise)
  - `POST /api/payments/verify` (`{ orderId, paymentId, signature }`)
- Contracts pinned by tests: order creation returns gateway order id + key; verify is idempotent on repeat success.
- If gateway env missing: order creation returns `500 { error: 'Payment gateway unavailable' }` without affecting other routes.

---

## Logging Invariants
- Use stable prefixes and keys for observability/tests:
  - Webhook: `[webhook] verified { type, subId, payId }`
  - Memberships: `[membership][plans][contract]`, `[membership][subscribe][created|creation_failed|unhandled]`
  - Invoices generator: `[invoice][generate][start|idempotent_legacy|idempotent_hit|pdf_failed|db_update_pdf_failed|created|upload_skipped_no_token|uploaded]`
  - Admin payments analytics: `[admin][payments][metrics|timeseries|latest|refunds]` (with `[slow]` ≥ 400ms)
- Do not rename these prefixes or remove key fields without updating tests and docs.

---

## Database Invariants
- Idempotency and uniqueness:
  - `Payment.gatewayOrderId` unique, `Payment.gatewayPaymentId` unique
  - `Payment.bookingId` unique (session payments: 1–1)
  - `Invoice.paymentId` unique; `Invoice.invoiceNumber` unique
  - `VIPMembership.subscriptionId` unique
  - Membership plans: canonical slugs; `MembershipPlan.razorpayPlanId` unique
- Indexes for hot paths:
  - Booking: `@@index([userId, scheduledAt desc])`, `@@index([healerId, scheduledAt, status])`, `@@index([scheduledAt])`
  - Payment: `@@index([statusEnum])`, `@@index([type])`, `@@index([userId])`
  - ProgramEnrollment: `@@index([userId, status])`, `@@index([programId])`, `@@index([healerId])`
- Do not drop or weaken these constraints without a migration plan and perf review.

---

## Environment Variables & Behavior
- `RAZORPAY_WEBHOOK_SECRET`: Required for webhook verification; if missing, webhook returns `500 { ok: false, error: 'secret-missing' }`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`: Razorpay SDK instantiation is lazy; absence must not crash build. API routes return descriptive errors instead of throwing at import time.
- `PAYMENT_EVENTS_ENABLED`: When `'true'`, webhook may apply idempotent side-effects; otherwise it only verifies and returns `{ ok: true }`.
- `BLOB_READ_WRITE_TOKEN`: When absent, invoice PDF upload is skipped and logged (`[upload_skipped_no_token]`); generator may still succeed with empty `pdfUrl` until retried.
- `RESEND_API_KEY`: Email sending is best-effort; failures are logged and do not fail the request.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`: Required for auth/session integrity.
- `TEST_MODE`: CI/E2E-only toggle for guarded shortcuts; must never be enabled in preview/production.

---

## No-Change Assertions (Must Remain Stable)
- API paths and methods listed above
- Response status codes and JSON keys (errors and success)
- Invoice resolution precedence (read-only helper)
- Download headers (`Content-Type`, `Content-Disposition`, `Cache-Control`)
- Logging prefixes and key fields
- DB uniqueness and indexes specified above
- Lazy SDK/client patterns to avoid build-time crashes

---

## Patch Plan Template (Required for any change)

```
Goal: <1-line summary>
Touched (modify):
  - path/FileA.ts – <reason>
  - path/FileB.ts – <reason>
New files (only if justified):
  - path/NewFile.ts – why existing files not suitable + how wired.
No-change assertions:
  - Public API endpoints unchanged: <list>
  - Error codes unchanged: <list>
  - Logging & debug gating preserved.
Tests:
  - Unit: <list>
  - E2E: <list if applicable>
Rollback:
  - Revert single commit; no schema migrations.
```

---

## Source of Truth
- These contracts are pinned by tests under `tests/` and `__tests__/` and reinforced in:
  - `docs/payments.md`
  - `docs/invoices.md`
  - `docs/GUARDRAILS.md`
- Update this doc together with tests whenever a contract must evolve.
