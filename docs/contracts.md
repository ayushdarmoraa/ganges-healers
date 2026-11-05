# Ganges Healers — Contracts & Invariants (Living Doc)

## Customer Order History

- `/dashboard/orders` requires a session with a nonempty user ID before any database query. Queries always include that owner ID.
- Status filters accept only the five existing order statuses. Unknown or repeated status values fall back to all orders. Missing, malformed, or repeated page values use page 1; numeric values are bounded to pages 1–1000.
- Pages contain at most 50 orders, ordered by creation time and ID descending. The extra queried record is a next-page sentinel; page 1000 never offers a link to page 1001.
- `/dashboard/orders/[id]` includes both order and owner IDs in the query. Missing and unowned orders share the same unavailable screen. Existing JSON API contracts remain unchanged, including the order API's 403 for an unowned order.
- `OrderItem.pricePaise` is the stored line total (quantity is already included), not a unit price. The details page displays this snapshot without multiplying quantity again.
- Loading, retry, and unavailable screens recover through the existing order routes. Progress describes the saved order status; it does not promise courier tracking or delivery dates.

This living document pins the repo’s public API contracts, HTTP headers, logging keys, database invariants, and environment variable behaviors. Changes to any item below require an explicit Patch Plan, updated tests, and reviewer approval per `docs/GUARDRAILS.md`.

## Scope

- Public API endpoints, methods, status codes, and response shapes
- Required/optional headers and cache semantics
- Stable logging prefixes and key fields used in observability and tests
- Database uniqueness/index invariants that guarantee idempotency and performance
- Environment variables and the exact behavior when they are absent/misconfigured

---

## Public APIs: Contracts to Preserve

### Password recovery
- `POST /api/auth/password-reset` accepts `{ email, callbackUrl? }`. Configured
  deployments return one generic `{ message }` before account lookup/delivery
  using Next.js `after`, so unknown and social-only emails share the same
  response. Invalid input returns 400; unavailable email/origin configuration
  returns 503 consistently. Responses are not cached.
- `POST /api/auth/password-reset/confirm` accepts `{ token, newPassword }` and
  returns `{ success: true }`. Passwords require 8–72 UTF-8 bytes; malformed,
  expired, superseded and consumed links return a safe 400 error. Tokens expire
  after 15 minutes; only SHA-256 hashes are stored in the existing
  `VerificationToken` table. A database uniqueness throttle limits delivery to
  one request per account every five minutes across serverless instances.
- Links use only configured `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`
  or the Vercel-provided `VERCEL_URL`; incoming Host headers are not trusted.
  HTTPS is required outside local non-production environments. Tokens travel
  in fragments, are removed from the address on landing and are submitted only
  in the confirmation body. The recovery page has no-referrer/no-index metadata;
  advertising pixels are excluded from account pages.
- Credential replacement and link consumption are atomic. A per-account
  conditional update serializes different concurrent links without deadlocks;
  successful recovery invalidates all remaining links and database sessions.
  JWT sessions bind to a digest of the current stored credential and fail on
  their next read after a password change. Existing cookies without that digest
  require sign-in once after rollout. Long-lived notification sockets reject
  stale/deleted accounts on connection and recheck at most every 30 seconds.
- Sign-in, registration, booking and existing password-change response shapes
  remain unchanged. Recovery preserves only a validated local callback and
  never signs the customer in automatically. Auth logs contain no email,
  password, token or recovery URL. No schema migration or dependency is added.

### Public marketplace data
- `GET /api/services/[id]` keeps `{ success, data }`, public catalog fields,
  `_count.bookings`, `healers`, numeric `averageRating`, and `totalBookings`.
  `totalReviews` is additive; ratings are computed from actual service reviews
  rather than averages of practitioner ratings. Unrated responses use zero.
- The legacy `data.bookings` array contains only `{ healer: <public summary> }`
  entries, one per active practitioner with a completed booking for the service.
  Public practitioner summaries expose only ID, bio, experience, rating,
  specializations, verification flag, and profile name/image.
- Intentional privacy correction: customer/booking IDs, appointment times,
  meeting links, financial snapshots, practitioner account IDs, private account
  fields, and raw availability are no longer returned or queried by this public
  endpoint. Consumers needing owned appointment details must use the existing
  authenticated booking APIs. No first-party consumer relies on the removed
  fields. Existing 404/500 responses and protected admin mutations are preserved.
- Inactive practitioners are excluded from service booking cards, public healer
  detail pages and their API. Missing/inactive healer details share the existing
  not-found result. Public healer profiles/directories link only active services.
- `GET /api/healers` preserves its envelope, pagination and numeric `ratingAvg`;
  `reviewCount` is additive. Directory/profile/homepage ratings use actual
  accepted session reviews, with one bounded aggregate for the displayed
  practitioner IDs and no review-body/customer export. An unrated practitioner
  has numeric zero/count zero in data and “No reviews yet” in the UI, regardless
  of any legacy stored rating. Homepage featured practitioners remain active and
  verified and are ordered by review count with a stable ID tie-breaker.
- Public healer `certifications` remain an array of plain names. Both legacy
  strings and saved `{ name, ... }` objects are supported; blank/malformed
  entries and duplicate names are omitted instead of rendering arbitrary objects.

### Booking and availability
- Healer profile booking links carry `openBooking=1` and the selected `healerId`.
  Service auto-open selects that exact active practitioner from the service's
  available healer list. Missing, inactive, unrelated, empty or ambiguous
  explicit selections show an unavailable message and never open a different
  healer. Existing service links without a healer selection retain their
  first-available behavior. A changed selected healer remounts the booking flow.
- Signed-out booking confirmation reserves no slot and opens sign-in with an
  internal callback preserving service, practitioner, program and product
  context. After sign-in, availability is selected afresh; no old slot is
  promised or held. An incomplete session still requires sign-in, and a loading
  session cannot trigger booking confirmation.
- `/auth/signin` honors one validated local `callbackUrl` for credentials and
  configured Google sign-in, and forwards it to registration. `/register`
  preserves it on both sign-in links and successful registration. Ordinary
  visits retain the existing dashboard destination. External/protocol-relative,
  malformed, control/backslash/double-encoded, overlong, API and authentication
  loop destinations fall back to `/dashboard`; duplicate callback parameters
  also use the safe default. Authorization checks on destination pages remain.
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

- **Notification inbox and read state**
  - Authenticated `GET /api/notifications` retains `notifications` and account-wide
    `unreadCount`, adding `ownerId` and `nextCursor`. Optional filters are
    `status=all|unread|read`, `type=all|community_comment|community_like|other`,
    `q` (up to 200 characters), `limit` (integer 1–100, default 30), and `cursor`.
    Results order by `createdAt DESC, id DESC`; cursors must belong to the session.
  - `PATCH /api/notifications/[id]/read` retains empty-body mark-read behavior and
    `{ok:true}`. New `{read:boolean, ownerId?:string}` supports marking unread
    and rendered-account verification; success adds `ownerId` and `unreadCount`.
  - New `PATCH /api/notifications` requires `{action:'readAll', ownerId:string}`.
    It marks all current owned unread rows, including rows outside filters, and
    returns `{ok:true, ownerId, updated, unreadCount}`. Later arrivals stay unread.
  - All operations require the session owner. Invalid input returns 400, anonymous
    access 401, missing/unowned IDs or cursors 404, and mismatched expected account
    409 with `SESSION_CHANGED` before writing. All responses are private/no-store.
  - Community notifications persist inline on confirmed queue unavailability.
    New jobs reuse a producer ID on retry without resetting read state; uncertain
    enqueue errors are not submitted again inline. Notification failure preserves
    the successful community interaction and its existing warning log.
  - Socket rooms require a valid Auth.js session cookie, ignore claimed user IDs,
    reject foreign browser origins, and expire with the token. Socket events are
    refresh hints; polling remains available. See `docs/notifications.md` for the
  full workflow, deployment limits, test coverage, and rollback.

- **Live application navigation**
  - The mounted Navigation V2 header uses the existing `/api/search` raw seven-group
    envelope. Suggestions use two or more trimmed characters, a 200-character client
    bound, a 300 ms debounce, HTTP/schema validation, and request cancellation.
    Server endpoint filtering, limits, cache policy, and error/logging keys are unchanged.
  - Search suggestions construct internal destinations from encoded resource fields.
    Enter routes to `/search?q=...`. Errors offer retry and are not shown as empty results.
  - Account identity and role shortcuts come from the existing session. Guest,
    member, healer, and admin links target existing guarded routes. These UI links
    do not change authorization or entitlement rules.
  - Sign out uses Auth.js with a fixed local destination. A success redirect requires
    a returned URL and an HTTP-successful empty/null `/api/auth/session` response.
    Active or uncertain sessions remain recoverable without a success redirect.
  - Header cart counts/actions use the existing cart provider and drawer; client
    display prices do not replace checkout's server-side pricing/ownership checks.
    The booking call to action leads to `/services`.
  - No schema, dependency, environment, authentication-provider, or test-mode contract
    changes. See `docs/navigation.md` for behavior, limits, verification, and rollback.

### Completed-session Reviews
- Path: `POST /api/bookings/[id]/review`
- Requires an authenticated, nonempty session user ID. The customer must own
  the booking; missing/foreign bookings both return `404`. A healer cannot
  review their own session (`403`). Booking status must be `COMPLETED` and its
  scheduled end must have passed (`409` otherwise).
- Body: `{ rating: 1..5, comment?: string }`. Rating is an integer; comments
  are trimmed, at most 2000 characters, and blank comments become null.
  Unexpected fields, invalid values and malformed JSON return `400`.
- The server derives customer, healer and service IDs from the saved booking.
  Review creation and healer rating-average updates share a transaction and
  the existing healer lock. The existing unique booking key enforces one review.
- Returns `201 { success: true, data: { id, rating, comment, createdAt },
  idempotent: false }`. An identical replay returns the same review with `200`
  and `idempotent: true`; a different second submission returns `409` and does
  not replace the accepted review. Unexpected transaction failures return a
  user-safe `500` and log `[booking][review][error]` with the error type only.
- `GET /api/bookings` adds the owned booking's `review: { id, rating, comment }
  | null`. Existing envelope and fields remain. My Bookings offers the review
  form for eligible completed sessions and shows accepted reviews read-only.
- Ratings and comments are public with the reviewer's profile name, as stated
  before submission. Comments render as plain text. Service catalog ratings
  use a single batched aggregate over actual review rows; unrated services
  show "No reviews yet" rather than a placeholder rating.

### Payments Webhook (Razorpay)
- Path: `POST /api/payments/webhook`
- Behavior:
  - Reads raw request body; computes HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`
  - If signature mismatch: `401 { ok: false, error: 'signature-mismatch' }`
  - If secret missing: `500 { ok: false, error: 'secret-missing' }`
  - On success: `200 { ok: true }` and a log line: `[webhook] verified` with `{ type, subId, payId }`
  - No database side-effects unless `PAYMENT_EVENTS_ENABLED === 'true'` (gated, idempotent)
  - `refund.created`, `refund.processed`, and `refund.failed` reconcile an existing
    gateway-bound refund intent. Provider payment ID, amount and INR currency must
    match the saved captured payment/refund. Event notes never identify an owner.
  - Confirmed refunds cannot be downgraded by delayed events or cancellation API
    responses. Failed refunds cannot regress to pending/unknown. A payment becomes
    `REFUNDED` only when confirmed refund records total its original amount;
    partial refunds retain the captured payment status. No refund is submitted by
    a webhook, and this handler does not reverse purchase entitlements.
  - An unrelated refund is acknowledged without creating records. A refund for a
    known payment whose gateway refund ID is not yet saved returns the existing
    `500 { ok: false, error: 'apply-error' }` retry response. This covers delivery
    racing the submission response; untracked dashboard refunds require operator
    reconciliation. Invalid/mismatched payloads and transaction failures use the
    same retry response. Check `[webhook][skip]` with reason `apply-error`.

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

## Course Progress

- `POST /api/courses/[slug]/progress` requires an active or completed enrollment
  owned by the session user. The body is `{ lessonOrder: number }`, referring to
  an existing nonnegative lesson order for that course. An invalid or nonexistent
  order returns 400; an enrollment that ceases to be active during the update
  returns 409. Concurrent and repeated requests cannot decrease saved progress.
- The existing `progress` field remains one greater than the furthest acknowledged
  lesson order, or zero before any update. The endpoint marks a course completed
  only when progress is greater than every lesson's order. Lesson orders may start
  at zero or one and need not be consecutive.
- `GET /api/courses/enrollments/me` retains `progress` and adds `completedLessons`,
  the count of lesson orders below the stored progress. The enrolled-courses page
  uses that count rather than treating the stored position as a count.
- This high-water-mark model treats earlier lesson orders as reached and does not
  record individual lesson completion or prevent skipping. Existing progress and
  premature historical `completed` statuses are not rewritten by this change.

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
