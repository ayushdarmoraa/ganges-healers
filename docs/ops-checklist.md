# Ops Checklist (Payments, Invoices, Webhooks)

## Environments & Secrets Audit

- Vercel envs: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`.
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

- Empty states render consistent copy; Clear filters removes q/filters only.

## Refunds & Cancellations


## On-call Runbook (tiny)

- “Invoices not opening” → hit `/api/invoices/[id]`, confirm 302; if 404, run admin generate: `POST /api/admin/invoices/generate { id }`.
- “Webhook 401 spikes” → compare secret on Razorpay vs Vercel; re-run simulator.
- “Subscribe errors” → check DB plan row has `razorpayPlanId` set.

## Dependency release checks

Use the committed lockfile with the pinned pnpm version. CI rejects critical
production dependency advisories before the build. This threshold does not assert
that lower-severity findings are resolved or that the site is exploitation-free;
review the complete `pnpm audit --prod` report when preparing a release.

The November 5, 2026 dependency follow-up stays on Next.js 15, Auth.js v5 beta,
React 19.1, Prisma 6, and the existing major versions of other runtime packages.
It replaces versions identified by the published
[Next.js image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[Auth.js configuration advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3),
[Auth.js email normalization advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh)
and [Sentry tunnel advisory](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55).
Advisory applicability depends on configuration; package findings alone do not
establish exploitation of the deployed site. Keep route-level authorization and
existing credential/session checks. Password hashing is a runtime dependency;
the email development CLI belongs to development dependencies. The unused legacy
Prisma authentication adapter is removed; runtime uses `@auth/prisma-adapter`.

Run the existing unit, UI, database, build and browser suites against the resolved
versions before merging. No schema migration or hosting setting change is included.
Rollback the dependency commit and its lockfile together if compatibility checks
fail; that also restores the earlier vulnerable versions and is not a release fix.

The final November 5 production dependency audit reports **0 critical, 1 high,
2 moderate and 1 low** findings, compared with 7 critical, 77 high, 74 moderate
and 10 low before the patch. These are package audit counts, not confirmed
application exploit paths. Targeted pnpm resolutions update compatible transitive
packages and prevent the old nested versions from remaining in the lockfile.
Next's optional Sharp resolution is explicitly fixed at 0.35.5 (within Next's
published supported range), and PostCSS 8 at 8.5.23. Webpack is an explicit
development dependency to satisfy Sentry's existing build peer requirement.

Remaining findings are tracked, not suppressed:

| Dependency path | Severity | Follow-up |
| --- | --- | --- |
| Prisma → config → deepmerge-ts 7.1.5 | High | Upstream fix requires v8. The advisory concerns cyclic JavaScript object graphs; this repo's static Prisma config does not merge public request objects. This is a code/configuration assessment, not proof of universal non-reachability. Prefer an upstream-supported Prisma dependency update over forcing an unreviewed major. [Advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) |
| Sentry → bundler plugins → glob 13 | Moderate | Fixed in glob 14.0.2; review the build-tool major upgrade. [Advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| Sentry → glob → minimatch 10 | Moderate | Fixed in minimatch 11.0.1; review alongside glob. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| Email render → html-to-text → deepmerge | Low | No patched release reported by this audit; keep template inputs constrained and track upstream. [Advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) |

The critical-only CI gate deliberately leaves these findings visible. It is not a
complete security review or evidence of a production deployment.
