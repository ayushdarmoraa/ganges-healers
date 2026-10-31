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
- A `bookingId` on availability requests requires authentication and ownership;
  it uses that booking's saved duration and excludes only that booking from
  the overlap preview. Missing or mismatched bookings return 404, and inactive
  or terminal bookings return 409. Reservation writes still recheck conflicts.
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
- `DELETE /api/bookings/[id]` and legacy `PATCH /api/bookings/[id]`
  (`{ action: "cancel" }`) use the same owned-booking cancellation flow. Only
  pending, scheduled, confirmed, or rescheduled bookings at least 24 hours
  before their start may be cancelled; completed bookings cannot be cancelled.
  The response includes `{ success, ok, data, alreadyCancelled, bookingId,
  message, refund: { band, refundPaise, status, message } }`. Refund amounts
  are calculated server-side from the saved booking and successful payment,
  never from client estimates. `refund.status` is `NOT_REQUIRED`, `UNAVAILABLE`,
  `PENDING`, `SUCCESS`, `FAILED`, or `UNKNOWN`. Only successful paid Razorpay
  payments can receive cash refunds; unpaid and credit bookings return
  `NOT_REQUIRED`. Real refunds are recorded before submission and cancellation
  retries serialize on the booking's healer lock. A known gateway refund is
  fetched on retry; an uncertain result without a gateway ID is never
  resubmitted automatically and requires reconciliation. No simulated refund
  is reported as real. Older cancelled bookings without a refund intent require
  support review because the previous implementation cannot prove whether the
  gateway was called.

### Product headline experiment
- Server rendering reads existing `ghx_product_headline` assignments and selects
  a variant without writing response cookies. The browser persists the rendered
  assignment with the existing 90-day, path-wide, SameSite=Lax cookie before
  sending the product-view event. Authenticated selection retains its stable
  hash; a first anonymous view without JavaScript cannot persist its assignment.

### Community moderation
- `POST /api/community/reports` retains `201 { success: true, data: { id } }`,
  `401` for signed-out requests, `404` for missing/hidden targets, `409` for an
  existing pending report, and `400` for validation errors. Reasons are trimmed
  before the 5–500 character check. Self-reports now return `400`; a comment
  under a hidden parent now returns `404`. Concurrent duplicate submissions
  serialize on the target and create one pending report and audit record.
- `GET /api/community/posts/[id]` adds `hasPendingReport` to the discussion and
  each returned comment, scoped to the authenticated member's pending reports.
  It does not disclose other reporters or reasons. Hidden discussions remain
  `404`; hidden comments remain excluded. New likes/comments recheck parent
  visibility under the moderation lock and return `404` after hiding.
- `GET /api/admin/community` retains `{ success, data, pendingCount }` for the
  report view and the existing nine metrics fields for `view=metrics`. Report
  results add `counts`, `nextCursor`, and target visibility/version metadata.
  `status=pending|reviewed|dismissed|all`, `type=post|comment|all`, `q`, `cursor`,
  and a sanitized `limit` (1–200, default 50) are supported. Invalid enumerated
  filters return `400`. `view=content` adds paginated text/visibility browsing;
  `visibility=visible|hidden|all` includes hidden parents for comment visibility.
  Metrics add `hiddenPosts`, `hiddenComments`, and `pendingReports`; visible
  comment/contributor metrics now exclude hidden parent discussions.
- `PATCH /api/admin/community` retains `{ reportId, action: reviewed|dismissed }`
  and `200 { success: true, data }`. Legacy `reviewed` still hides the target;
  it now closes all pending reports for that target atomically. `dismissed`
  closes only one report. Additive actions are `resolve` (close one without
  changing visibility), `hide`, `restore`, `pin`, and `unpin`. Direct actions
  accept `{ targetType, targetId }`; optional `expectedUpdatedAt` rejects stale
  content with `409`. Responses add `idempotent` and `resolvedCount`.
- Moderation requires a real signed-in actor whose current database role is
  `ADMIN`, including in the guarded test runtime. The global test-mode guard
  and production gating remain unchanged. Conflicting completed decisions
  return `409`; repeating the same completed report decision as its moderator
  returns its saved result without repeating visibility changes.
- Report creation and moderation write their audit record in the same
  transaction. Parent-first PostgreSQL locks serialize reports, decisions,
  new comments, and like toggles. This is an application locking protocol,
  not a database uniqueness constraint for pending reports.
- Restore rejects author deletions, unknown removal history, hidden parent
  discussions, and unresolved reports with `409`. Closed report history stays
  closed. Pinning hidden discussions returns `409`; unpinning them is allowed.
  See `docs/community-topics.md` for the moderator workflow and rollback.

### Community catalog administration
- `GET|POST|PATCH /api/admin/community/catalog` require a real signed-in actor
  with the current database role `ADMIN`, using the existing community guard.
  Member topic/tag APIs retain their current response fields and sign-in rules.
- GET accepts `kind=topic|tag`, `status=all|active|inactive` (topics), `q` up to
  200 characters, cursor, and an integer limit of 1–100 (default 25). It returns
  `{ success, data, nextCursor }`. Items include stable IDs/slugs, editable
  display fields, an opaque `version`, and linked `postCount` including hidden
  discussions. Invalid filters return `400`.
- POST accepts `{ kind, name, slug }` plus optional topic `description`, integer
  `order` (-1,000,000 to 1,000,000, default 0), and `isActive` (default true).
  Names are trimmed to 1–100 characters; descriptions to at most 1,000. New
  slugs normalize to lowercase and permit 1–80 letters/numbers separated by
  single hyphens. Success is `201 { success, data }`; a duplicate slug within
  the same kind returns `409` with `code: SLUG_UNAVAILABLE`.
- PATCH requires `{ kind, id, version, changes }`. Slugs are immutable; unknown
  or unsupported fields are rejected with `400`. Editable topic fields are
  `name`, `description`, `order`, and `isActive`; tags support `name` only.
  Stale versions return `409 CATALOG_CHANGED`; missing records return `404`.
  Success is `{ success, data, idempotent }`. Versions cover editable fields,
  not usage counts. No-op edits do not add audit history.
- Catalog changes and auditing commit together. Admin topic updates take an
  exclusive row lock. Publishing holds a shared topic row lock while checking
  availability and inserting the post, retaining `400 TOPIC_UNAVAILABLE` when
  the topic is unavailable. Multiple publishers can proceed concurrently.
- Deactivation preserves all existing content and associations while removing
  the topic from directories and publication choices; its landing page remains
  unavailable under the existing active-topic rule. Reactivation restores it.
  This workflow adds no deletion endpoint, schema migration, or dependency.

### Blog drafting and publication
- `GET|POST|PATCH /api/admin/blog` use the real current-role admin guard and
  `Cache-Control: private, no-store`. GET supports `id` for full content/version,
  or `status=all|draft|published`, `q`, `limit=1..100` (default 25), and cursor
  for `{ success, data, counts, nextCursor }` metadata pages. Missing IDs return
  404; invalid input returns 400.
- POST accepts title, permanent slug, optional plain-text content, excerpt,
  and image URL. It always creates `published: false`, overriding the legacy
  default, with `201 { success, data }`. Slugs normalize to lowercase and remain
  immutable; conflicts return `409 SLUG_UNAVAILABLE`.
- PATCH requires `{ id, version, changes }`. Editable fields are title, content,
  excerpt, image URL, and published state. Omitted fields stay unchanged. Stale
  versions return `409 ARTICLE_CHANGED`; empty published content returns
  `400 CONTENT_REQUIRED`. No-op saves do not add audit history.
- Changes and audits commit together under a row lock. Activity actions are
  `blog_draft_created`, `blog_article_updated`, `blog_article_published`, and
  `blog_article_unpublished`. Audit failure rolls back publication/content;
  audit metadata contains field names/status rather than article bodies.
- Admin article writes maintain the full-text search vector in that transaction,
  independently of migration triggers. Already current vectors are not rewritten.
  A no-op save may repair indexing without changing the editable version or
  adding a publication/content audit event.
- Public `GET /api/blog` keeps its published metadata array; public
  `GET /api/blog/[slug]` keeps the raw article and ID-or-slug lookup, returning
  404 for drafts/withdrawn records. Successful blog APIs use `no-store`, and
  lists no longer read the process-local blog cache.
- Global search keeps its response groups and cache for non-blog groups. Blog
  results are always queried fresh, ignoring old cached blog payloads. Search
  successes use `no-store`. Blog detail pages and the sitemap render dynamically.
- Preview/public bodies render escaped plain text; image validation shares the
  existing Next/Image host configuration. Dates retain the existing creation
  timestamp; separate publication/revision history is not claimed. No schema,
  environment, dependency, or deletion endpoint is added. See
  `docs/blog-publishing.md` for the workflow and rollback.

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
