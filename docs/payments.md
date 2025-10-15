# Payments: Contracts and Webhook

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
