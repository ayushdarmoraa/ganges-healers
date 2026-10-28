# Payments: Contracts and Webhook

## Purchase resource binding

`POST /api/payments/create-order` keeps its successful response
`{ orderId, amountPaise, currency, key, paymentId }`, but no longer accepts an
unbound amount and arbitrary fulfillment metadata:

- Sessions: send `{ bookingId }`. The owned booking supplies its saved price.
- Programs/courses: send `{ type: 'PROGRAM' | 'COURSE', metadata: { enrollmentId } }`
  for an owned pending enrollment. The active catalog record supplies its price.
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
Program/course enrollments have no price snapshot in the current schema: if the
catalog price changes while a payment is pending, verification fails closed and
the pending purchase needs reconciliation before fulfillment. This change does
not add payment capture reconciliation or transactional fulfillment retries.

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
  - `REFUNDS_ENABLED` (explained in invoices doc)

- Testing (contracts pinned by)
  - `membership.plans.api.contract.test.ts`
  - `membership.subscribe.dryrun.api.test.ts`
  - `membership.subscribe.live.api.test.ts` (SDK mocked)
  - `payments.webhook.verify.api.test.ts`
