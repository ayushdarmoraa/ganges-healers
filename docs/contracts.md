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

### Account closure
- `GET /api/users/account` is an owner-only, private/no-store closure review.
  `DELETE` requires JSON, same-origin input, the displayed owner and review
  version, explicit retained-record acknowledgement and `CLOSE MY ACCOUNT`.
  A receipt is returned only after the transaction commits. This is account
  closure, not personal-data erasure or a cancellation/refund request.
- Normal sign-in issues an HMAC-bound, five-minute recent-authentication proof
  tied to the account and current password/factor version. Ordinary JWT refresh
  and client session updates cannot renew it. Closure rechecks it under the
  account lock. Existing sessions without this proof must sign in again, using
  their existing credentials/Google and authenticator rules. No new provider,
  password bypass or MFA exception is introduced.
- Current staff roles or any linked practitioner record block self-closure.
  Upcoming/ongoing open bookings, non-cancelled membership subscriptions,
  active/paused programs, nonterminal store orders and processing payments
  must be resolved first. A final review rechecks these conditions; an account
  edit or changed blockers requires an explicit review refresh.
- Paid and shipped orders remain open for closure review. Delivered and
  fulfilled orders are retained as completed history and do not block closure.
- A shared account advisory lock and User row lock serialize confirmation.
  `closedAt`, security-version increment, database-session/recovery-link
  revocation, phone-challenge expiration and a non-sensitive `account_closed`
  audit commit atomically. Audit failure rolls everything back. Replays fail.
  Password, email, phone, OAuth/factor records, roles, credits, purchases,
  bookings, invoices, payments and refund history remain stored. Email/phone
  identities stay reserved. Existing in-flight transactions/provider callbacks
  can settle against retained records; closure does not undo fulfillment.
- Closed accounts cannot pass password/OAuth sign-in, JWT issuance or refresh,
  notification reconnect/revalidation, recovery or verification. Conditional
  profile/password writes also refuse closed accounts. No public reopen or
  hard-delete endpoint is supplied. Existing payment callbacks remain intact.
- The settings card validates receipts, ignores obsolete owner replies,
  blocks duplicate confirmation, keeps failed drafts and requires explicit
  refresh after conflicts. Sign-out cleanup can be retried after a confirmed
  closure without sending DELETE again.
- Migration `20261106190000_account_closure` adds one nullable User field with
  no backfill or data deletion. Apply schema before code. For repair, disable
  new closures while retaining all closed-account authentication guards and
  the additive column; restoring pre-closure auth would reopen closed users.

### Account phone verification
- `GET /api/users/me/phone-verification` is authenticated, owner-only and
  private/no-store. It returns the saved phone, matching verification date,
  availability/format flags, an opaque active request ID/expiry and resend time.
  Provider IDs, credential fingerprints, passwords and codes are never returned.
- POST requires JSON, same-origin requests and the displayed `ownerId`/`phone`.
  `action: request` additionally requires `consent: true`; `action: confirm`
  requires the current `challengeId` and a 4–10 digit code. A changed owner is
  409 `SESSION_CHANGED`; changed phone/security is 409 `PHONE_CHANGED`.
  Invalid/expired/replayed checks return 400; throttles return 429/Retry-After;
  unconfigured or unavailable SMS returns a truthful 503, never a fake code.
- Only exact international `+` numbers are eligible; no country is inferred for
  legacy local numbers. Profile inputs accept up to 16 characters to accommodate
  the plus sign and 15 digits. Existing optional/local phone storage remains
  compatible. A phone change clears both verification fields atomically.
- Twilio Verify uses a fixed HTTPS origin, bounded eight-second requests,
  redirect rejection and explicit service/phone/SID/channel validation. Only
  the provider's approved check can verify; a pending send is not approval.
  API-key credentials take precedence as a complete pair, without falling back
  from a partial key to another account. Existing account/auth-token credentials
  remain supported when no key pair is present. No code or provider error body
  is persisted in the database or logs.
- `PhoneVerification` stores one current request per account. Account locks
  reserve a 60-second resend cooldown, three-send hourly budget and five-check
  attempt budget. A short durable lease serializes checks; all provider I/O
  occurs outside database transactions. Late responses must match the current
  request/lease, saved phone and credential/factor version before writing.
  Approval and challenge consumption are atomic. Ambiguous send failures retain
  their rate budget because an SMS may already have been accepted remotely.
- `phoneVerifiedAt` alone is not authority: status also matches the saved number
  against `phoneVerifiedHash`. Verification changes no password, role, session,
  authenticator, credit, membership or purchased entitlement, and adds no new
  login requirement. Codes remain outside URLs/cookies/browser storage.
- Settings ignore old owner/phone replies, clear code/consent on account/profile
  changes, validate success replies and support explicit retry/status refresh.
  The additive migration leaves existing numbers unverified. Browser test-server
  launches blank SMS credentials; positive provider outcomes use isolated Jest
  fixtures. No test-only phone approval endpoint or hardcoded production OTP is
  introduced. Actual SMS delivery/provider activation remains unverified.

### Client analytics request bodies
- `POST /api/events/track` returns 400 `Invalid event payload` for malformed,
  empty or non-object JSON before resolving cookies/accounts or writing events.
  Optional email must be a string/null, and metadata must be an object/null;
  malformed field shapes receive the same validation error.
  Existing allowed event types, the 400 `Invalid event type` response, the
  `{ ok: true }` acknowledgement, attribution and server-only event exclusions
  remain unchanged. Unexpected processing errors retain their existing 500.

### Healer profile bio
- `PATCH /api/healer/profile` accepts `bio: null`, matching the existing healer
  editor's clear-bio payload. Omitting the field retains the saved bio, and the
  2,000-character limit and existing owner/current-role checks remain in force.

### Customer profile edits
- `GET /api/users/me` retains its private owner-only `user` projection and adds
  an opaque `profileVersion`. GET/PATCH responses are private/no-store.
- The updated settings form sends `X-Account-Id` and a quoted `If-Match`
  profile version on PATCH. A changed session returns 409 `SESSION_CHANGED`;
  a stale profile returns 409 `PROFILE_CHANGED`. Conditional metadata must be
  supplied as a valid pair (400 otherwise). Existing JSON callers without both
  headers retain their request format; they do not receive draft-version checks.
- PATCH still accepts only name, phone and image changes and retains the `user`
  response. `profileVersion` is additive. JSON writes are required (415),
  cross-site writes are refused (403), and malformed JSON is a validation error.
  Phone uniqueness conflicts, including concurrent claims, return the existing
  409 message. Unexpected errors keep their logging namespaces without raw PII.
- The version binds the account's saved name/phone, not unrelated credits,
  credentials or avatar activity. A transaction and atomic conditional update
  prevent a writer committing between read and write from being overwritten.
  Only requested editable fields change; roles, credentials, balances, purchases,
  verification and MFA remain intact. No schema or dependency change is needed.
- Settings hide old account details and remount drafts when the session owner
  changes. Failed saves and failed reloads retain the draft. Discard/reload is
  explicit, replies must match owner/values/version before reporting success,
  and duplicate submissions are blocked. Failed session-menu refresh does not
  turn a confirmed save into a claimed failure. Avatar provider behavior is
  outside this profile-edit follow-up.

### Account email verification
- `GET /api/users/me/email-verification` requires a current authenticated owner
  and returns only `{ ownerId, email, verifiedAt }` with private/no-store headers.
  POST accepts the displayed `{ ownerId, email }` snapshot and rejects changed
  owners/addresses with 409 `SESSION_CHANGED`. The recipient is loaded from the
  database, never selected from request input. Cross-site and non-JSON writes
  are refused; unavailable mail/origin configuration returns 503.
- Authenticated requests schedule delivery through the existing Resend service.
  The existing account advisory lock and `VerificationToken` table provide a
  shared five-minute delivery cooldown. Failed delivery deletes only that
  attempt's token and throttle reservation, permitting retry without erasing a
  newer reservation. Logs never contain an address, raw token or link.
- Links expire in 30 minutes and store only a SHA-256 token hash. They bind the
  account ID, normalized current email and security version. The shared trusted
  origin helper preserves password-reset configuration/exports and ignores
  incoming Host headers. Tokens travel in fragments, are cleared on opening,
  and are not consumed by page load or link previews. The page remains outside
  advertising scripts and uses no-referrer/no-index metadata.
- `POST /api/auth/email-verification/confirm` accepts only `{ token }`, verifies
  the still-current email/security version and atomically consumes the token
  before marking `emailVerified`. Expired, replayed, changed-account and
  wrong-purpose links return 400. Concurrent confirmation has one winner.
  Successful confirmation clears other verification links for that account.
- Verification does not create a session, change a password/role/security
  version, remove an authenticator, consume recovery codes or impose a new
  sign-in requirement on existing accounts. Settings display only responses
  matching their current owner, preserve errors and refresh after returning to
  the tab. No schema migration, dependency or external credential is added.

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
- Service discovery links use the supported text-search parameter instead of
  nonexistent category constants. Category choices come from distinct active
  catalog values. Filter state remounts on a changed URL, including browser
  back/forward and cleared filters; legacy `q` searches remain supported.
  Invalid/repeated numeric filters are not passed to Prisma as NaN/infinity;
  zero is a valid price bound. Every empty filtered result offers a link to
  clear all catalog filters.
- The service page and `GET /api/services` accept `minRating` from 1 to 5
  with up to one decimal place. They compare against the average of all
  submitted service reviews. Unrated services are omitted when this filter is
  set. API pagination and totals apply after the rating filter. Invalid or
  repeated numeric values are ignored, and API page sizes are capped at 100.
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

### Administrator service catalog

- The admin editor and service write APIs validate names, descriptions,
  categories, service modes, prices and durations before saving. Prices are in
  rupees with at most two decimal places, from zero to ₹21,474,836.47 so the
  booking price fits the stored paise amount. Durations are whole minutes from
  1 to 1440, matching the session delivery limit.
- `POST /api/services` generates the slug from the name and keeps the
  `201 { success, data }` response. `PUT /api/services/[id]` keeps
  `200 { success, data }` and accepts partial changes to catalog fields.
  Malformed JSON, invalid fields, and update keys outside the catalog return
  `400 { error }`. A duplicate slug returns `409 { error }`.
- The admin form keeps input available after a rejected save. A successful
  creation clears the form. Activation and deactivation remain separate
  from editing and preserve linked bookings and billing records.
- The healer and program editors also keep input after rejected saves.
  Healer edits use the same biography, experience and specialization limits
  as the healer profile API. Program writes use the existing catalog service
  and report validation and duplicate-slug failures inside the editor.

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

## Course enrollment and checkout recovery

`POST /api/courses/[slug]/enroll` keeps its paid-checkout fields (`orderId`,
`amountPaise`, `enrollmentId`, `key`) and ignores client-selected prices or owners.
An existing pending checkout returns the saved order and agreed quote with
`resumed: true`. A saved quote survives catalog price changes; older pending
reservations without an order can continue rather than blocking retries.

A zero-price server quote returns `{ enrolled: true, enrollmentId, amountPaise: 0 }`
and grants active access without a gateway or payment row. An already active or
completed enrollment retains `409` and `error: 'Already enrolled'`, adding
`enrolled: true` so the client can continue learning. Course enrollment and order
allocation are serialized per customer/course and use the existing shared purchase
lock to coordinate generic payment checkout and fulfillment. Missing gateway configuration and
failed order creation do not persist a new reservation that would block retry.
Receipts remain within the gateway's 40-character limit.

An existing terminal or inconsistent payment is not replaced by a new checkout;
it returns `409` for review. Retrying an unpaid persisted order does not create
another enrollment or replace its quoted amount. Provider orders created before a
failed database commit can remain unused at the gateway; no success link is
returned for them, and a later request may create a fresh order.

The button preserves the course destination through sign-in, grants free access
without opening checkout, and requires the existing `{ verified: true }` response
before reporting a paid purchase. Courses without lessons return to My Courses
instead of constructing an undefined lesson URL. Course data, licensed media and
real gateway delivery still need their separate release checks. No migration or
provider configuration change is introduced by this patch.

## Program checkout recovery

`POST /api/programs/[slug]/enroll` preserves the paid response fields and reuses
one pending enrollment and its saved quote. Retries add `resumed: true`; an active
enrollment keeps `409` and adds `enrolled: true` for dashboard recovery. Allocation
is serialized per customer/program. Generic checkout and program enrollment use
the same owned-purchase order writer and purchase lock, so concurrent requests
persist one payment/order even if unused provider orders were created before the
second database check. A gateway failure leaves a resumable pending reservation.

Multiple older pending enrollments, a changed selected healer, or inconsistent or
terminal saved payments require review (`409`) rather than a second charge.
Zero-price programs remain unsupported by this paid endpoint. The button retains
the selected program through sign-in, offers Continue checkout after dismissal,
and requires `{ verified: true }` before reporting success. Program fulfillment
and appointment scheduling behavior are unchanged and need their separate release
checks. No schema migration, live provider call or hosting change is required.

## Program session delivery (implementation-plan Sprint 4)

`GET /api/program-enrollments?scope=mine|healer|admin&page=1` and
`GET /api/program-enrollments/[id]` return private enrollment views. Pages are
bounded to 10 enrollments and 1000 pages, ordered by creation time and ID. Normal
customers see only their own enrollments; active practitioners see their assigned
work; administrators can manage all enrollments. Current database roles are
checked. Private responses use `Cache-Control: private, no-store`.

The authenticated `PATCH /api/program-enrollments/[id]` accepts strict `assign`,
`schedule`, `cancel`, `complete`, `pause` and `resume` actions. Only administrators
assign active practitioners. Assignment uses the new `assignedHealerId`; it never
changes the original `healerId` bound into the payment quote. Existing verified
payment replays keep their original price, resource and practitioner bindings.
Customers cannot grant access or mark attendance themselves. Unpaid enrollments
cannot reserve sessions. Paused enrollments cannot open a duplicate checkout.

Actual reservations live in `ProgramSession`, uniquely keyed by enrollment and
session number. The purchased schedule snapshot defines session count/duration;
later catalog edits do not change them. Older pending purchases without a snapshot
freeze current terms on their next quote; historical original terms cannot be
reconstructed from absent data. The activation helper rebases proposed dates when
payment is confirmed. Malformed or oversized snapshots require review.

Old JSON dates remain proposals until staff confirms a reservation. Confirmation
and rescheduling enforce future, 30-minute-aligned clinic times in Asia/Kolkata,
the practitioner's working window and actual duration. Program and service
reservations share the existing healer advisory lock and overlap query, including
intervals crossing midnight. Rescheduling excludes only its own reservation.
Cancelling a reservation releases capacity; it does not cancel/refund the purchase
or remove the purchased session. Staff cannot overwrite completed sessions, and
completion opens only after the reserved end time. Repeated completion is
idempotent; the last completed session closes the enrollment at 100% progress.
Legacy completed schedule entries retain their history.

Pause requires reserved sessions to be cancelled first; resume preserves progress
and purchased terms. Reassignment likewise requires all live reservations to be
cancelled or completed first. Calendar/meeting links describe confirmed rows only;
optional meeting links must use HTTPS. No remote meeting is fabricated.

The admin catalog validates positive paid prices, bounded session counts (1–366),
frequency (1–7 per week) and duration (1–1440 minutes). Catalog deletion archives
programs with any enrollment. Catalog writes/deletion and new allocations share a
catalog lock so a concurrent purchase cannot be cascaded away. Existing active
access survives archival. Existing paid enrollment response fields are unchanged.

Migration `20261105200000_program_session_reservations` adds the reservation table,
status enum, assignment column, foreign keys, indexes and duration/number checks.
It backfills no appointments and modifies no original quote bindings. Apply it
before deploying this code; otherwise availability reads will fail because the
new reservation table is required. Test the exact SQL on an isolated schema and
the app against a disposable database. To roll back application behavior, preserve
the additive table/column and reservation data; removing the schema is not needed.
Do not deploy older booking-only overlap code while live program reservations
exist, because it would ignore those reservations.

## Credential-free calendar exports (implementation-plan Sprint 3)

`GET /api/bookings/[id]/calendar` and
`GET /api/program-enrollments/[id]/sessions/[number]/calendar` return a private,
authenticated iCalendar attachment. Customers can export their own appointments;
assigned active practitioners and administrators can export work they manage.
Unauthorized records return `404`, absent authentication `401`. A program proposal
has no calendar reservation to export. Booking requests are tentative; confirmed
appointments and cancellations retain their actual state.

Exports use absolute UTC intervals, stable resource UIDs, escaped text and UTF-8
line folding. They omit customer email/attendee lists and reject unsafe meeting
URLs. See [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). Download/import works
without Google/Zoom/API credentials. The file is a point-in-time export; it is not
a subscribed calendar or automatic remote synchronization. Re-download after a
change and check the account screen for current appointment status.


## Authenticator protection (implementation-plan Sprint 2, Day 20)

`GET /api/users/me/two-factor` returns only the authenticated owner's enabled
state, password availability, and count of unused recovery codes. `POST` accepts
strict JSON actions `begin`, `enable`, `cancel`, `disable`, or `recovery`. All
actions require the current password; enabling also requires a valid pending
authenticator code, and disabling/replacing recovery codes requires a current
authenticator or unused recovery code. Account IDs supplied in the request body
are rejected. Cross-site requests are rejected; responses are private/no-store.

Setup lasts ten minutes and is bound to the current password hash. Secrets use
20 random bytes and an account-bound AES-256-GCM envelope, with a key derived
from the existing `AUTH_SECRET` (or existing `NEXTAUTH_SECRET`). No additional
credential or external QR service is needed. The QR image is generated locally.
A password change invalidates pending setup and existing sessions but does not
remove an enabled factor. A recovery-email/password reset alone cannot bypass it.

TOTP follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) with six digits,
a 30-second period, and one step of clock skew. Each accepted counter is consumed
once under the account advisory lock. Eight independently generated 128-bit
recovery codes are shown once and stored as account-bound SHA-256 hashes.
Concurrent requests cannot reuse either factor. Five failed factor/settings
attempts in five minutes impose a durable per-account throttle. Password-only
sign-in is rejected for protected accounts, and linked Google sign-in is denied
while the local factor is enabled. OAuth approval is checked again at JWT
issuance so concurrent activation cannot create a bypassing session.

Enabling, disabling, or replacing recovery codes increments `User.securityVersion`.
Every authenticated session read checks that version along with the password
version; socket authorization performs the same existing periodic recheck.
Disabling never restores an older session. The UI displays recovery codes only
for their owner, requires acknowledgement before signing out, and keeps them
available after a sign-out failure. It requires explicit server success before
announcing any security change. Secrets and codes are not written to logs. Settings and navigation share a
confirmed sign-out helper, then navigate to their validated local path. They do
not follow a configured-host redirect returned by the authentication service.

Apply additive migration `20261105210000_authenticator_security` before deploying
this code. Existing users default to security version zero and have no enabled
factor. The exact SQL preservation test runs inside a rolled-back isolated schema;
application and browser tests use only the verified disposable test database.
Do not deploy pre-MFA authentication code while any account has an enabled factor;
that code would ignore it. Preserve the new schema and use a compatible application
fix for rollback. Preserve the authentication secret across releases: changing it
invalidates cookies and makes old encrypted TOTP keys unreadable. Saved recovery
codes still permit login, authenticated disable, and fresh enrollment with the
new key. There is no email-only or administrative factor-bypass endpoint.


## Weekly availability editing (implementation-plan Sprint 3, Day 30)

`GET /api/healer/availability` returns the current healer's normalized weekly
schedule in the existing `{ success, data }` envelope and an owner-bound strong
ETag. Reads and writes are authenticated and private/no-store. The healer role
is verified against the current database account; PUT checks ownership and role
again after acquiring the same healer advisory lock as service and program
reservation writers. An inactive healer may edit their hours; inactive accounts
are still unavailable for booking.

`PUT` keeps the existing raw weekly object: lowercase weekday keys map to
`{ start, end }` or `null`. Omitted days become days off as before. New writes
require ordered, half-hour-aligned times; `24:00` is permitted only as an end
boundary. Unknown fields, reversed/equal windows and malformed JSON return 400.
Existing valid minute-based windows remain readable and their offered starts
remain aligned; the editor displays their exact stored values and requires
alignment before a new save. Unreadable schedules fail closed and the editor
never substitutes a silently editable empty schedule.

The editor sends the loaded ETag in `If-Match`; a stale or foreign snapshot
returns 412 without changing the database. Wildcard and matching strong tag
lists are accepted; weak tags do not match. Legacy clients may omit the
precondition, preserving their existing unconditional-write contract. The PUT
response retains `{ success, data }` and adds the new `version` token in JSON;
the editor uses it for the next save. GET supplies the HTTP ETag; PUT does not
supply an HTTP validator for a potentially normalized request representation.
See [HTTP conditional request semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match).

An edit changes the weekly rules for new reservations; it never moves, cancels
or deletes an existing appointment, including a confirmed appointment outside
the new window. Concurrent booking and schedule writers serialize on the same
lock, so each new reservation checks the rules committed before it. Changing
hours does not issue a refund, consume credits, or contact a provider.

Public and owned-rescheduling availability keep their existing response fields,
actual purchased/service durations, and shared overlap checks. The slot list is
now generated from the saved working window, including hours before 10:00 and
after 20:00. A session must finish before closing; a day off returns no starts,
and passed starts today are unavailable. Times remain in Asia/Kolkata. Public
slot responses contain no reservation IDs and are no-store.

The editor loads only its own schedule, clears state across account changes,
keeps drafts after failed saves, requires explicit server success plus a valid
version, and offers a deliberate reload after a conflict. Failed loads have a
retry action and cannot overwrite saved hours. All controls have distinct
accessible day/time labels. No dependency, schema migration, hosting change or
new credential is required. Roll back the application commit if needed; stored
JSON retains the same shape and appointments remain intact.


## Course authoring and archival

`/admin/courses` uses the private, current-database-admin guarded
`/api/admin/courses` API. GET accepts `id`, or bounded `q`, `status`
(`all|draft|published`), `limit` (1–100, default 25) and cursor filters. Lists
contain course metadata and counts, never lesson text/media or student records.
Opening an editor returns its lessons and a SHA-256 saved version. Every response
is private/no-store. Metadata/lesson mutations and their audit record commit
together; role and saved-version checks run again under the course catalog lock.

POST creates an unpublished course using validated title, stable normalized slug,
description, integer nonnegative price in paise, and an optional cover URL from
the existing image-host configuration. PATCH requires `{ id, version, change }`.
Supported `change.action` values are `details`, `publish`, `archive`, `add_lesson`,
`edit_lesson`, `delete_lesson`, and `reorder_lessons`. Lesson fields are title,
plain text and optional HTTPS video/embed URL; at least text or video is required.
Arbitrary HTML is rendered as text. Unknown action/field inputs and malformed JSON
return 400. Saved-version conflicts return 409 `COURSE_CHANGED`; drafts survive
until the administrator explicitly reloads. New lessons append after existing
orders, and reordering requires an exact permutation of all saved IDs.

Publication requires valid metadata and at least one complete lesson with unique
nonnegative order values. Drafts permit up to 200 lessons. The URL slug does not
change after creation. Before any deletion, adding/removing/reordering lessons,
the service checks all enrollment states and course-bound payment metadata. Any
such record returns 409 `PURCHASES_PROTECTED`, preserving saved quotes, payments,
progress and lesson identities. Existing lesson content may be corrected without
changing its order. DELETE requires `{ id, version }` and removes only an archived,
unpurchased draft after the UI's explicit confirmation.

The enrollment allocator takes the same `course`/`catalog:<id>` advisory lock
before its existing per-customer purchase locks, then rereads active state and
price. Existing enrollment/payment price snapshots still govern checkout retries.
No payment-provider call, activation contract, receipt field or webhook changes.

Archive means no public catalog/search listing and no new enrollment. Existing
active/completed students retain private course detail, lesson and progress access,
including through My Courses. Pending-payment and unrelated users do not receive
archived lesson content. Public course responses still omit lesson text/media.
Course search publication state and the public course list are read freshly;
archival does not depend on invalidating another serverless instance's memory
cache. The stored progress watermark remains unchanged.

No schema or dependency change is required. Prefer a compatible application fix
for rollback after archival; reverting to older course-access code would hide
archived curricula from existing students. Media ownership, private storage and
expiring delivery of licensed assets remain separate provider/content tasks.


## Ordinary appointment delivery and practitioner actions

The existing owned healer booking GET/PATCH response envelopes remain
`{ success, data }`, with private/no-store responses. The healer list's existing
payment projection adds the non-secret gateway name; it never exports gateway
signatures or credentials. The customer booking list is private/no-store as well.

PATCH `/api/healer/bookings/[id]` adds
`{ action: "SET_MEETING_LINK", meetingLink: string|null, version: updatedAt }`.
The version is the exact ISO timestamp returned with the saved booking. New links
require HTTPS, at most 2,000 characters, no embedded credentials and no control
characters; explicit null removes the link. They are never fetched by the server.
Edits apply only to future/ongoing CONFIRMED or RESCHEDULED appointments. Invalid
bodies/JSON return 400; missing/foreign ownership retains 404/403; stale versions
and invalid delivery state return 409. The transaction locks the assigned healer,
rechecks current ownership/role, and compares timestamp and status before writing.
Updated timestamps advance monotonically by at least one millisecond so two
writes in the same clock tick cannot share a version. No booking time, saved
price, payment, refund or credit is rewritten by this action.

Customers receive the saved link only through their existing owned bookings and
calendar routes. UI links use a new tab with noopener/noreferrer. Calendar exports
and cards also reject unsafe legacy URLs. Cancelled/completed cards omit the join
action; cancelled exports omit the URL. Session dates are labeled in India time.
Account changes hide and clear private booking/link state. A rejected or malformed
save keeps the healer's draft until an explicit reload. No Google/Zoom event or
email delivery is claimed by saving a manually supplied link.

The existing CONFIRM/CANCEL/COMPLETE bodies remain supported, with intentional
state/funding guards: a positive-price unpaid booking cannot be manually confirmed;
confirmation needs a valid future interval and its captured price, an applied VIP
credit or a zero-price appointment. COMPLETE accepts confirmed/rescheduled rows
only after their valid stored interval ends. Premature or inconsistent requests
return 409; invalid status transitions retain 400. These actions take the same
healer lock and reject stale updates instead of restoring terminal bookings.

Practitioner CANCEL refuses captured payments and applied VIP credits with 409,
leaving every booking/payment/credit row intact for cancellation/refund review.
This replaces the unsafe earlier status-only cancellation of funded sessions.
Unpaid holds may still be cancelled after UI confirmation. No provider refund or
credit-return policy is invented here; existing customer cancellation/refund
contracts remain unchanged. Audit entries commit with accepted changes and contain
action/boolean link presence, never the meeting URL, token, password or customer
contact data.

No migration or dependency is required. Roll back the UI/API/helper changes
together if needed; retain existing stored links. Prefer a compatible fix rather
than restoring the earlier premature completion or funded-cancellation behavior.


## Product-photo uploads and draft recovery

`POST /api/admin/upload-product-image` retains `{ url }` success and `{ error }`
failure envelopes and the `[admin][upload-product-image]` logging namespace.
It now requires a current database administrator, returns private/no-store, and
checks nonempty JPEG/PNG/WebP metadata and format signatures before storage.
Signatures are not a full image decode. Files are limited to 4 MiB (previously
5 MiB, which exceeded the platform request limit with multipart framing).
Oversized declared bodies return 413; invalid files remain 400. Missing storage
returns 503, while storage failures remain 500. Paths contain random UUIDs and no
original filename; provider exception text and credentials are not logged.

With PRODUCT_IMAGES_BLOB_STORE_ID configured, the server obtains a refreshed
short-lived Vercel identity for each validated, authorized upload and explicitly
passes both identity and dedicated store ID to Blob. It never lets the SDK fall
back to shared invoice storage when identity is unavailable. An explicit
PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN remains a supported dedicated fallback.
Without a dedicated store ID, that token and the legacy BLOB_READ_WRITE_TOKEN
retain their existing precedence. Missing usable authentication remains 503;
provider upload failures remain 500, without retries against another store.
New Preview provisioning uses the dedicated OIDC connection only, leaving invoice
storage configuration unchanged. @vercel/oidc is a direct dependency at the same
version already resolved by @vercel/blob; no new package resolution is introduced.
No database fields, purchase totals, payment endpoints or test-mode gates change.

The existing create-product form keeps successful gallery images when a later
upload fails, retries only failed files, and limits new galleries to eight images.
Create/update server actions also validate new or changed image URLs against configured HTTPS hosts; unchanged legacy image locations remain editable alongside unrelated product details, and new galleries cannot exceed eight entries. Creation waits for uploads/content generation, blocks duplicate submissions and
requires failed images to be retried or explicitly discarded. Failed product
creation retains the draft; successful creation clears it. Account/role changes
unmount the editor and abort pending requests so late responses cannot populate
another account. Removing an image from the draft does not delete storage objects
that another saved product might use. Revert form, route and shared image policy
together; no schema rollback is needed. Retain any already saved storage objects.


## Store order fulfillment

- Administrators can open `/admin/orders` from either admin menu. The queue
  separates paid, shipped, and delivered orders, and shows saved addresses
  only on the individual order page. The delivered queue includes older
  `fulfilled` orders.
- Staff record shipment with a carrier and tracking number. Paid orders
  require a matching captured store payment and an address. If an older
  order has no complete saved address, staff enter the verified address
  used for the shipment. Existing complete addresses are kept.
- Shipment waits for refund review when the payment has a refund that has
  not failed. Staff explicitly confirm delivery for shipped orders, including
  older shipments without tracking. Each transition checks the current order
  version, then writes its status, tracking and private audit together.
- Customers see saved tracking in My Orders. The owned
  `GET /api/store/orders/[id]` response optionally includes validated
  `order.tracking`. It never returns the raw tracking record or staff audit.
  The staff records reflect manual shipment and delivery confirmation.
- Apply `20261106210000_store_fulfillment` before deploying the new code.
  Its nullable column preserves older orders and its index supports the
  staff queues. To roll back the feature, revert the code and retain the
  column and saved shipment history.

## Store product deletion and purchase-history preservation

The private administrator delete action no longer calls an unguarded product
cascade. The Products page disables deletion for any order-item or bundle-item
reference and explains the existing Deactivate option. Unreferenced products
require explicit permanent-deletion confirmation. A canonical SHA-256 version of
all product scalar fields rejects changed records, including same-timestamp edits.
Account/version changes invalidate open confirmations, while failures retain the
confirmation and offer a list refresh. Responsive product cards retain visible
controls on narrow screens.

The server locks the Product row FOR UPDATE in a Read Committed transaction,
rechecks the current administrator role and saved version after waiting, then
checks indexed order/bundle references before deletion. PostgreSQL foreign-key
inserts hold a conflicting key-share lock: an in-flight order that commits before
the deletion decision is retained and prevents deletion. This coordinates with
existing nested checkout writes without changing payment or checkout contracts.
See the [PostgreSQL row-lock documentation](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS).

Deletion and a non-sensitive product_deleted audit commit together. All order
statuses protect the product, including pending and cancelled orders; prices,
totals, payment bindings and bundle composition remain intact. Domain failures
PRODUCT_IN_USE, PRODUCT_CHANGED, PRODUCT_NOT_FOUND and FORBIDDEN are returned as
safe private action results. Public APIs and database schema stay unchanged.
The two new runtime modules separate transactional store writes from the
interactive confirmation; the existing read-query and creation modules remain
focused. For rollback, disable deletion while repairing it; do not restore the
unguarded cascading action. No schema or historical-data rollback is needed.


## Service/healer deactivation instead of permanent deletion

Services and healer profiles are retained through the existing isActive controls.
The administrator pages no longer expose permanent Delete buttons or register the
old unguarded deleteService/deleteHealer server actions. This intentionally
retires a private destructive action that could cascade through bookings into
payments, refunds, invoices and reviews, or discard program delivery assignments.
The visible Deactivate/Activate controls, metadata editing and Verify/Unverify
flows remain. Administrative cards stack controls on narrow screens and explain
which records deactivation preserves. Reload open admin pages after deployment.

This changes no public API, authentication gate, database schema, billing amount,
booking time/status or purchased program term. Customer booking history/calendar
access continues even when its catalog service/practitioner is inactive. Use the
existing Activate action to reverse deactivation. If repairing/rolling back this
change, retain the deactivation-only behavior; do not restore cascade deletion.

## Sign-in feedback and development continuity

The existing Auth.js credentials and optional Google providers, stored-password
verification, MFA checks and callback validation are unchanged. Failed or
unconfirmed credentials retain a persistent, non-enumerating inline alert as
well as the existing toast; transport failures use a separate generic alert.
Email is retained for retry while password and one-use factor inputs are cleared.
A synchronous submission guard prevents duplicate requests, and standard password
manager autocomplete is available. Recovery/registration links remain accessible.
No demo identity, default administrator or authentication bypass is introduced.
No schema, environment, dependency or payment changes; revert the focused page
and test changes together if necessary.

## Administrator manual VIP and free-credit edits

The existing /admin editor now binds each save to the reviewed account identity,
manual VIP flag, free-session balance and version. Balances must be nonnegative
whole Postgres integers and every actual change needs a nonempty reason (up to
300 characters). Administrator authorization is checked again after acquiring
actor/target row locks in stable ID order. Stale account edits or concurrent
credit consumption return USER_BENEFITS_CHANGED rather than overwriting newer
values. Missing actors/targets and invalid inputs fail explicitly. No-op saves
write neither balance nor audit.

Only User.vip and User.freeSessionCredits change. The transaction also creates a
user_benefits_updated activity entry with actor ID, target ID, before/after values
and reason; an audit failure rolls back the change. Passwords, roles, MFA,
membership terms, credit ledgers, bookings, payments and invoices are untouched.
The existing rule remains: manual VIP applies only without subscription history;
subscription access follows its current lifecycle and expiry.

The account-bound editor retains failed drafts, blocks duplicate/pending saves,
and requires a fresh user-list review after conflicts. It clears the editor on
session changes and ignores late responses. Internal server-action results are
now explicit success/error objects; no public HTTP API changes. No migration,
dependency or environment changes. Revert page/form/helper together for repair;
do not silently restore stale balance overwrites.

## Managed audio publication and playback

`/api/admin/audio` provides private/no-store current-administrator GET/POST/PATCH
operations. Lists are bounded (25 default, 100 maximum), with status/search and
stable cursor pagination; summaries omit media URLs and long descriptions.
Creation always produces a private draft. Slugs are normalized and immutable;
case-insensitive slug/id collisions are refused. Details, publish and withdraw
require the saved content version and a fresh administrator role after the audio
transaction lock. Metadata/publication changes and their activity audit commit
together. There is no permanent deletion operation.

The additive `20261106103000_audio_publication` migration adds
AudioTrack.isPublished (default true) and a publication/date index. Existing
tracks keep their visibility; the admin creation path explicitly writes false.
Publishing requires valid fields and a nonempty credential-free HTTPS media URL.
Durations are whole seconds from 1 through 86,400. Draft media URLs may be empty.
Withdrawn rows and their stable identities remain available to administrators.

Public list/detail response shapes and premium eligibility are retained: current
VIP access or an active program/course enrollment can unlock premium audio.
Drafts/withdrawn tracks are absent from playback, metadata, catalogs, free home
previews, published counts, service links, search and sitemaps. Public audio reads
use current publication/premium state; old instance-local list caches are not
trusted after edits. Audio search joins the existing fresh-publication groups,
while unrelated result caching is retained. Catalog responses are no-store;
detail responses are private/no-store, and premium catalog URLs remain redacted.

Admin and player requests abort on account/selection changes and ignore late
responses. A changed listener immediately loses the previous media element while
fresh access loads. Admin save failures retain drafts, conflicts require an
explicit saved-version reload, and pending/dirty edits cannot publish silently.
No payment, membership, invoice, existing logging namespace or test-mode rule is
changed. Apply the additive migration before deploying the matching code; retain
its column/rows during repair. A rollback to code without publication filtering
would expose drafts, so repair compatibly rather than removing the gate.
