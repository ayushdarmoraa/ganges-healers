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

- Programs: owners can enroll, resume a saved checkout, and view purchased sessions in My Programs. Staff assigns practitioners and reserves program-owned appointments; proposals remain unconfirmed until reservation succeeds.
- Product Detail CTA → navigates to `/services/<serviceSlug>?openBooking=1&productSlug=<slug>` and opens BookingModal (context only).
  - Emits client-only analytics event `product_service_cta_click` on click; no server/API/DB changes.

- Empty states render consistent copy; Clear filters removes q/filters only.

## Refunds & Cancellations


## On-call Runbook (tiny)

- “Invoices not opening” → hit `/api/invoices/[id]`, confirm 302; if 404, run admin generate: `POST /api/admin/invoices/generate { id }`.
- “Webhook 401 spikes” → compare secret on Razorpay vs Vercel; re-run simulator.
- “Subscribe errors” → check DB plan row has `razorpayPlanId` set.

## Dependency release checks

Use the committed lockfile with the pinned pnpm version. CI rejects high and critical
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

The final compatibility follow-up pins Prisma config's `deepmerge-ts` to 8.0.0,
Sentry bundler plugins' `glob` to 14.0.2, and that glob's `minimatch` to 11.0.1.
The published engines support the existing Node 20 CI runtime. Deepmerge v8 changes
Map/deepmergeInto behavior; the existing Prisma configuration supplies ordinary
configuration records and Prisma uses `deepmerge` through c12. Generated-client,
configuration-loading and full application/build/browser checks verify this usage.
Glob keeps the `glob` API used by Sentry; the real build verifies plugin behavior.
These narrowly scoped resolutions avoid upgrading the application framework or
Prisma major. Keep them until the parent packages adopt supported fixed versions.

The production dependency audit is **0 critical, 0 high, 0 moderate, 1 low** after
these fixes, compared with 7 critical, 77 high, 74 moderate and 10 low before the
first dependency patch. No findings are suppressed. The CI gate now rejects high
as well as critical findings. See the full audit output for lower-severity results.

| Resolved dependency | Fix / verification |
| --- | --- |
| Prisma → config → deepmerge-ts 7.1.5 | Pinned 8.0.0 after reviewing the v8 changes and current configuration API usage. [Release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) |
| Sentry → bundler plugins → glob 13 | Pinned 14.0.2; cancellation returns immediately instead of continuing traversal. [Advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| Glob → minimatch | Pinned 11.0.1, compatible with glob 14's declared dependency. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |

One low-severity finding remains visible: email render → html-to-text →
`deepmerge` 4.3.1. The [published advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
reports no patched release. The application passes its own fixed React templates to Resend without
caller-controlled render/plain-text options; user text is rendered as content,
not as a deepmerge options object. This is a bounded code assessment, not proof about every upstream path.
Do not invent a fixed version or remove the finding from audit results. Track an
upstream patch. The audit threshold is not a complete security review or evidence
of a production deployment. Roll back the dependency resolutions and lockfile
together if compatibility fails; doing so restores the earlier package findings.


## Browser CI setup

The configured browser project is Chromium. CI installs Chromium and its system
dependencies instead of also downloading unused Firefox/WebKit runtimes. Keep
this installer aligned if another project is added to `playwright.config.ts`.
All browser scenarios remain enabled. Installation has a ten-minute step limit;
the suite has a fifteen-minute Playwright global timeout so reporters can finish,
and the overall browser job has a thirty-minute limit. A setup timeout is a
failed check, never evidence that application journeys passed. These bounds
require no provider credentials or hosting change.
