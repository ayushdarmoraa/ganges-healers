# Payments: Contracts and Webhook

## Purchase resource binding

`POST /api/payments/create-order` keeps its successful response
`{ orderId, amountPaise, currency, key, paymentId }`, but no longer accepts an
unbound amount and arbitrary fulfillment metadata:

- Sessions: send `{ bookingId }`. The owned booking supplies its saved price.
- Programs/courses: send `{ type: 'PROGRAM' | 'COURSE', metadata: { enrollmentId } }`
  for an owned pending enrollment. The enrollment's saved price supplies its quote.
- Store: send `{ type: 'STORE', metadata: { orderId } }` for an owned pending order.
  The saved order total supplies its price.
- Memberships use `/api/memberships/subscribe`.

An optional `amountPaise` is an assertion and must match the server price.
Unbound or conflicting references and price mismatches return 400; another
owner's resource returns 403; missing resources return 404; resources not awaiting
payment return 409. Fulfillment metadata is rebuilt from database records.
Existing booking checkout and dedicated enrollment/store endpoints keep their
request and success shapes. Clients previously creating standalone SESSION or
MEMBERSHIP orders must use the linked booking or subscription flow instead.

`POST /api/payments/verify` requires the signing secret and validates the HMAC,
gateway, currency, resource owner, binding, and price before recording success.
Refunded payments cannot be verified again. Successful replays must use the same
gateway payment ID and still check ownership, without repricing a past purchase.
New program/course enrollments save the agreed price before creating the gateway
order. A catalog change cannot reprice that purchase. Legacy enrollments with no
snapshot freeze the current catalog quote on their next create-order request;
historical prices are never inferred from payment metadata. An older pending
payment with a different amount fails closed and needs reconciliation.

Quote creation reuses a matching pending gateway order for the same owned purchase.
Verification serializes callbacks for that purchase and commits payment success,
enrollment activation, booking confirmation, and store inventory changes in one
database transaction. Counted stock is decremented conditionally, including when
different orders compete for the last item. A fulfillment failure rolls back those
database writes. A valid retry can repair an earlier successful payment whose
purchase is still pending, provided its amount matches. Completed replays do not
fulfill or decrement stock again. Invoice generation is outside that transaction;
failure does not reverse a completed purchase, and a verified replay retries it.

This does not add gateway capture reconciliation or automatic refunds. A signed
callback and local rollback cannot reverse money already captured by the provider;
failed fulfillment still requires a retry or operational reconciliation.

## Enrollment price migration

Apply `prisma/migrations/20261029000000_enrollment_price_snapshots/migration.sql`
before deploying this application version. It only adds nullable `pricePaise`
integer columns to the two enrollment tables. Existing rows remain intact with
unknown historical quotes; no backfill or destructive reset is required. The
integration suite applies this exact SQL to temporary legacy tables and checks
row preservation. The migration has not been applied to production by this change.
An application rollback can leave these additive columns in place.

Optional analytics failures are logged separately from payment success. Tests
wait for activity/analytics side effects rather than forcing Jest to exit.

- Canonical VIP plan slugs
  - Canonical only: `vip-monthly`, `vip-yearly`
  - Input aliases accepted by API: `monthly` → `vip-monthly`, `yearly` → `vip-yearly`
  - DB is the source of truth for `razorpayPlanId`
  - Current mapping (from DB):
    - `vip-monthly` → `plan_RNJHCpbWJ6TwcH`
    - `vip-yearly` → `plan_RQ8lRhJvV5jTdX`

- Subscribe API
  - POST `/api/memberships/subscribe` body `{ planSlug: string, dry?: boolean }`
  - Dry-run marker: `SUBSCRIBE_V3`
  - Success shape: `{ id, shortUrl }` (supports `short_url` vs `shortUrl`)
  - Errors:
    - 400 `{ error: 'unknown-plan' | 'plan-missing-id' }`
    - 500 `{ error }` (see logs)
  - Logging tags: `[membership][subscribe]`

- Plans API
  - GET `/api/memberships/plans`
  - Returns exactly two DB-backed plans (active), ascending by `pricePaise`
  - `benefits.freeSessions` is a number
  - Logging tags: `[membership][plans]`

- Razorpay webhook
  - One active endpoint: POST `/api/payments/webhook`
  - Raw-body HMAC (SHA-256) with `RAZORPAY_WEBHOOK_SECRET`
  - 401 on mismatch; 200 `{ ok: true }` on verify
  - Logging: `[webhook] verified { type, subId, payId }`
  - No DB side-effects (guarded for future with idempotency tests)

- Environment
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  - Booking cancellation refunds use `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`;
    see the booking refund contract and [invoice operations notes](./invoices.md).

- Testing (contracts pinned by)
  - `membership.plans.api.contract.test.ts`
  - `membership.subscribe.dryrun.api.test.ts`
  - `membership.subscribe.live.api.test.ts` (SDK mocked)
  - `payments.webhook.verify.api.test.ts`

## Gateway receipt identifiers

All order-creation paths use the shared `createGatewayReceipt` formatter: generic
payments, programs, store purchases and courses. Receipts consist of their existing
purchase prefix and a random UUID without separators, giving unique references
of at most 39 characters. They do not depend on record-ID lengths or clock ticks.
Amounts, currency, resource metadata, order IDs and public response fields are
unchanged. Existing receipts remain valid and need no backfill.

This implements the [Razorpay receipt contract](https://razorpay.com/docs/api/orders/fetch-with-id/)
(maximum 40 characters and unique per order). The formatter is separate from lazy
SDK construction so it is shared without initializing a provider client or requiring
credentials. Local format checks and mocked order creation do not establish a real
provider checkout or capture.

Generic and program enrollment checkout share `src/lib/payments/create-order.ts`.
It resolves an owned resource and freezes its server quote, reuses a matching
pending order, and rechecks under the existing purchase lock after provider I/O.
Provider notes include only string/number values; nullable fulfillment bindings
remain in canonical database metadata. The original API response fields and
payment fulfillment checks remain in place. Program retries are described in
[the API contracts](./contracts.md#program-checkout-recovery).
