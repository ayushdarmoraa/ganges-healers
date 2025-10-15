# Ops Checklist (Payments, Invoices, Webhooks)

## Environments & Secrets Audit

- Vercel envs: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, `REFUNDS_ENABLED`.
- Confirm no duplicates or outdated secrets.
- Rotate `RAZORPAY_WEBHOOK_SECRET`:
  1) Generate new secret (securely)
  2) Update Razorpay Dashboard → Webhooks → Secret
  3) Update Vercel env → redeploy (ensure old traffic is drained)

## Razorpay Dashboard

- Exactly ONE webhook per env → `POST /api/payments/webhook`.
- “Test webhook” via local simulator (requires matching secret):
  - `pnpm simulate:webhook --file fixtures/razorpay.subscription.activated.json`
- Plans: DB is source of truth; canonical slugs only: `vip-monthly`, `vip-yearly`.
  - Mapping:
    - `vip-monthly` → `plan_RNJHCpbWJ6TwcH`
    - `vip-yearly` → `plan_RQ8lRhJvV5jTdX`
  - No legacy `MONTHLY` plan row in DB.

## Pre-deploy Smoke (CLI)

- Lint/Types:
  - `pnpm lint && pnpm typecheck`
- Tests (targeted suites):
  - `pnpm test -i` (membership, invoices, webhook, admin metrics)
- Webhook sim (requires dev server and secret):
  - `pnpm simulate:webhook --file fixtures/razorpay.subscription.activated.json`

## Public Contract Quick Checks

- Programs: Program detail shows a UI-only "Enroll (coming soon)" banner; no backend calls are made.
- Product Detail CTA → navigates to `/services/<serviceSlug>?openBooking=1&productSlug=<slug>` and opens BookingModal (context only).
  - Emits client-only analytics event `product_service_cta_click` on click; no server/API/DB changes.

## Refunds & Cancellations


## On-call Runbook (tiny)

- “Invoices not opening” → hit `/api/invoices/[id]`, confirm 302; if 404, run admin generate: `POST /api/admin/invoices/generate { id }`.
- “Webhook 401 spikes” → compare secret on Razorpay vs Vercel; re-run simulator.
- “Subscribe errors” → check DB plan row has `razorpayPlanId` set.
