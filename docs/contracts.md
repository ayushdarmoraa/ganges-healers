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

### Booking and availability
- `GET /api/availability?healerId=...&date=YYYY-MM-DD` uses India time
  (`Asia/Kolkata`) for both dates and slot labels. An optional `serviceId` uses
  that active service's duration; without it the existing 60-minute default
  remains. An unknown or inactive service returns 404. Invalid or past India
  dates return 400. Public availability does not expose booking IDs.
- Booking and rescheduling requests continue to accept an ISO UTC instant.
  The booking form converts its India-time slot to that instant and labels the
  timezone. A slot must be in the future, aligned to 30-minute boundaries and
  fit fully inside the healer's working window; test mode retains its existing
  time/window shortcuts but never bypasses overlap prevention.
- Pending, scheduled, confirmed and rescheduled bookings occupy their complete
  intervals. Adjacent intervals are allowed. Create and reschedule serialize by
  healer inside a PostgreSQL transaction, recheck overlaps before writing, and
  return 409 for a conflict. Rescheduling excludes itself, retains the booked
  duration and rejects cancelled or completed bookings. Stale confirmation and
  reschedule transitions cannot revive a concurrently cancelled booking.
- The advisory lock coordinates application writers that participate in this
  protocol; it is not a database exclusion constraint. Direct SQL and external
  writers must follow the same protocol. Existing conflicting bookings are not
  automatically changed, and pending bookings continue to occupy their slots.

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
  - `POST /api/payments/create-order` (owned booking, or generic type + owned resource reference)
  - `POST /api/payments/verify` (`{ orderId, paymentId, signature }`)
- Contracts pinned by tests: order creation returns gateway order id + key; verify is idempotent on repeat success.
- Prices and fulfillment metadata come from the linked database resource. Optional caller
  amounts must match. Unbound SESSION/MEMBERSHIP requests are rejected; use booking and
  subscription flows respectively. See `docs/payments.md` for migration and error details.
- Verification checks signature, resource ownership, gateway, currency and amount before
  success. Replays check ownership and the original gateway payment ID without repricing.
- Program/course enrollment quotes are saved at purchase time. Matching pending orders
  are reused. Verified payment success and fulfillment commit together; failed stock or
  enrollment updates roll back, and retries cannot fulfill the purchase twice.
- Deploy the additive enrollment price migration before this application version;
  legacy rows keep a nullable quote until their next create-order request.
- If gateway env missing: order creation returns `500 { error: 'Payment gateway unavailable' }` without affecting other routes.

---

## Audio Catalog and Playback

- `GET /api/audio` remains public and returns `{ tracks, categories }`, with the existing
  category filter and track fields. Every premium track has `audioUrl: null`, including
  cache hits. Free track URLs remain available.
- Clients must request `/api/audio/[slug]` for playback. Premium URLs are returned only
  after the existing session, VIP membership, or active enrollment checks. Denied access
  keeps the `200` response with `audioUrl: null`, `locked: true`, and a reason.
- Catalog redaction does not revoke previously shared media URLs. Storage access and
  expiring signed media delivery remain separate deployment requirements.

## Optional Admin AI Content

Optional admin AI product content generation initializes its SDK only after an
authorized, valid request. `POST /api/admin/generate-product-content` returns 503
when `OPENAI_API_KEY` is absent, 400 for invalid input/JSON, and preserves its
configured success response. Building/importing routes does not require this
optional key. SDK errors are logged by type without key fragments or input text.

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
