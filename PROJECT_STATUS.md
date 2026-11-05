# Ganges Healers — Implementation and Rollout Status

Reviewed November 4, 2026 against the implementation plan, repository branches, open pull requests, Neon ownership/migration records, and Vercel metadata. This replaces the September 2025 inventory, which described features that have since been implemented.

## Current development line

Continue on `codex/membership-fulfillment` (PR #8), stacked on `codex/release-auth-readiness` (PR #7) and `feat/store-order-details` (PR #6). It includes the community, publishing, notification, and navigation work from PR #5, customer-order screens, and course-progress corrections originally developed in PR #4. The application remains a Next.js App Router project; the plan's example microservice layout is not the current repository layout.

| Plan area | Implementation present | Remaining validation or release work |
| --- | --- | --- |
| Foundation | Prisma migrations, CI, guarded test databases, health route, structured logs, Vercel configuration | Reconcile production schema/history and deploy the reviewed combined line |
| Accounts and profiles | Registration/sign-in, sessions, role guards, account settings, healer profile/availability; optional phone handling and configured Google provider discovery | Real signup/sign-in/sign-out browser test passes; release-readiness CI run 41820806182 passed all six jobs. Google needs OAuth credentials and callback configuration |
| Marketplace and bookings | Discovery, availability, creation, rescheduling, cancellation, credit confirmation | Combined-line concurrency, refund, and customer/healer flow tests |
| Payments and memberships | Server-priced orders, verification/webhooks, enrollment fulfillment, invoices; owned subscription quotes, idempotent paid credit grants, expiry checks | Gateway test-mode checkout and callback delivery; mocked refunds do not establish live execution |
| Programs and courses | Catalogs, enrollment and lesson delivery; corrected counts, final-lesson completion, monotonic progress | CI integration/browser checks; paid enrollment is separate from isolated progress fixtures |
| Community and content | Topics/tags, drafts, administration, moderation/report review, blog publishing/withdrawal | Combined-line CI and role review before rollout |
| Notifications and navigation | Inbox/read state, bells, polling/socket paths, search, account menus, cart | Combined-line CI and deployed responsive/authentication checks |
| Store | Catalog/checkout, owned order details, status filters, bounded paging, saved line totals, recovery screens | Order browser coverage and separate gateway checkout testing |
| Administration and analytics | Admin workspaces, payment reports, funnel/events, experiments, products | Provider configuration, access controls, data consistency, monitoring |

Implementation present means routes/components exist. It does not establish every production journey or completion of the whole website.

## This batch

- Integrated existing course progress/ownership fixes, portable Windows loader URLs, and Playwright artifact exclusion.
- Require a nonempty session user ID before querying order history. Detail queries retain order and owner IDs.
- Preserve filters, stable ordering, 50-record pages, JSON APIs, and stored line totals. Stop at page 1000 and normalize malformed/repeated parameters.
- Add loading, retry, and unavailable route screens with existing UI primitives. No dependency or schema migration is introduced.
- Add UI coverage for ownership, pagination, totals, cancellation and recovery, and a database-backed browser scenario with isolated customers and fixtures.
- Local checks: 353 unit tests, 190 UI tests, TypeScript, focused ESLint, diff checks, and browser-test discovery passed. Local database/build checks were limited by network access to Neon and Google Fonts. The pull request checks are authoritative for current CI integration/build/browser results.
- Combined-branch CI at `6c11c7b` passed: 353 unit, 179 integration, 190 UI, 26 browser tests, and the production build. One existing integration test and one existing browser test remain skipped. The order browser scenario waits for the filtered results before selecting its exact fixture.
- A subsequent Vercel Preview exposed an import-time Razorpay failure in membership subscriptions when payment credentials are absent. Reuse the shared lazy client after plan validation and dry-run handling; preserve success/error contracts. Seven focused unit checks cover import safety, missing credentials, dry runs, subscription creation, diagnostics, and plan validation. See PR #6 for the follow-up CI result.

## Release readiness follow-up

- Fix registration when the optional phone is blank; entered short phone numbers and mismatched passwords remain invalid.
- The real browser scenario registers through the form, checks the saved password hash, rejects a wrong password, verifies the signed-in user's identity, and signs out. It uses no test-login endpoint or forged CSRF token and removes its isolated test user.
- Require a nonempty user ID before any customer dashboard reads, matching the order-history guard.
- Register Google only when a complete credential pair exists; require verified Google email. The sign-in UI discovers active providers and does not offer an unavailable Google flow.
- Add auth-form and dashboard authorization checks without adding dependencies or migrations.
- Configure the two previously unsupported cron expressions for daily execution on the existing Hobby plan. Reminder thresholds are eligibility checks, not promised delivery times; see `docs/deployment.md` for schedules and backlog limits.
- Existing Razorpay test credentials were added to Preview. Real gateway checkout and callback validation remain required.
- The preceding code at `8152886` passed all CI stages: 360 unit, 179 integration, 190 UI and 26 browser checks. One legacy integration placeholder and the now-replaced auth browser scenario were skipped. The follow-up PR records current results.
- Follow-up CI at `0f1cea9` passed 368 unit, 179 integration, 198 UI and 27 browser checks, including real form signup and sign-out. Only the legacy integration placeholder remains skipped.
- The preserved-data Preview exposed duplicate legacy membership cards and fabricated fallback statistics/customer quotations. Homepage plans now use canonical slugs and configured benefits; statistics use actual counts, including zero; the store shows product-selection guidance.
- An isolated copy of the older live database was verified table-by-table, upgraded additively to the application schema and reconciled to all 22 migrations. The release branch's protected Preview uses this copy. See `docs/database-rehearsal.md` for verified scope and the fresh-snapshot/write-maintenance procedure still required for production.

## Membership completion batch (PR #8)

- Real checkout requires an authenticated owner, reuses pending checkout links, and saves a server-owned price/benefit quote. The actual gateway plan must match the displayed amount, currency, frequency, and interval before a customer is sent to pay. Billing remains one cycle.
- Signed subscription charges record payment and grant credits in one transaction. Replays/concurrency, mismatched charges, unpaid activation, delayed cancellation/activation, and extra-cycle charges are covered by integration tests. Enabled application failures return 500 for provider retries; the environment gate remains.
- VIP access in bookings, audio, community, and sessions checks current membership lifecycle/expiry. Existing manual VIP accounts without subscriptions retain access. The customer balance shows remaining credits, pending links can be continued, and expired plans can be purchased again.
- Invoice generation supports the current schema without assuming the legacy invoiceUrl column exists, and membership receipts describe the actual purchase.
- Local verification: 382 unit tests, 203 UI tests, TypeScript, focused ESLint, and diff checks passed. Initial isolated CI passed the new real database/payment/invoice cases but exposed a missing auth mock in the public dry-run suite; the fixture now explicitly verifies that dry runs never call auth. The updated full CI result is required before merge.
- Preview-only membership side effects are enabled on the isolated verified copy with test-mode credentials. Production is unchanged. A real gateway test charge/callback and production configuration remain release gates; a configured key or synthetic signed test does not prove provider delivery.

## Database ownership and rollout

The `ganges-healers` and `ganges-healers-preview` Neon projects now belong to `gangeshealers@gmail.com` in Ganges. The production-named project retains four branches and its approved six-hour recovery window; preview retains its separate branch.

A read-only migration-history check on the transferred `ganges-healers` project found no successful entries for these development-line migrations:

- `20260322000000_restore_missing_baseline_models`
- `20260325120000_scale_readiness`
- `20261029000000_enrollment_price_snapshots`
- `20261031000000_restore_missing_columns_indexes`

Missing entries do not prove every corresponding schema object is absent. Compare the intended target schema, rehearse additive SQL on an isolated copy, and reconcile history before a reviewed deployment migration. Do not reset production or blindly mark migrations applied.

The current Vercel Production `DATABASE_URL` and `DIRECT_URL` point to a different endpoint from the transferred `ganges-healers` default production branch. They match the older Vercel Marketplace Neon store. Therefore the two completed project transfers do not establish migration of the database used by the existing live deployment. Identify and compare that database before any data cutover or production URL change. Preview variables match the dedicated transferred preview project, whose expected enrollment, analytics, and product columns were checked read-only.

Vercel's production deployment predates this combined feature work. Feature branches and passing tests do not establish a production rollout. Verify payment, email, upload, cron, and optional worker configuration at deployment; keep test shortcuts disabled in Preview and Production.

The Vercel Git connection was repaired from the old `pahadi-labs` owner to `ayushdarmoraa/ganges-healers`. The release-readiness branch changes the unsupported hourly and six-hourly cron expressions to daily schedules supported by the current Hobby plan. All five endpoints remain configured; precise hourly messaging requires a different scheduler. Preview uses its dedicated database, authentication secret, and Razorpay test credentials. The earlier `codex/preview-store-course-5035361` branch is a separate snapshot of `8152886` with cron execution disabled in its configuration. Deploy the new branch and verify it before rollout.

## Release sequence

1. Finish combined-branch CI and address failures without weakening flow assertions.
2. Review stacked pull requests and reconcile database prerequisites on an isolated copy.
3. Validate a Vercel Preview with its dedicated database, customer/healer/admin roles, enrollments, and payment test-mode flows.
4. Roll out reviewed application/migrations with rollback or roll-forward steps, then check production health, authorization, callbacks, logs, and customer journeys.

See `docs/GUARDRAILS.md`, `docs/contracts.md`, and `docs/deployment.md`. Git Bash update commands for the Windows checkout are in `README.md`.
