# Ganges Healers — Implementation and Rollout Status

Reviewed November 4, 2026 against the implementation plan, repository branches, open pull requests, Neon ownership/migration records, and Vercel metadata. This replaces the September 2025 inventory, which described features that have since been implemented.

## Current development line

Continue on `feat/store-order-details`. It includes the community, publishing, notification, and navigation work from PR #5, customer-order screens, and course-progress corrections originally developed in PR #4. The application remains a Next.js App Router project; the plan's example microservice layout is not the current repository layout.

| Plan area | Implementation present | Remaining validation or release work |
| --- | --- | --- |
| Foundation | Prisma migrations, CI, guarded test databases, health route, structured logs, Vercel configuration | Reconcile production schema/history and deploy the reviewed combined line |
| Accounts and profiles | Registration/sign-in, sessions, role guards, account settings, healer profile/availability | Real-provider and deployed authorization checks; an existing registration browser case is skipped |
| Marketplace and bookings | Discovery, availability, creation, rescheduling, cancellation, credit confirmation | Combined-line concurrency, refund, and customer/healer flow tests |
| Payments and memberships | Server-priced orders, verification/webhooks, enrollment fulfillment, invoices, subscriptions | Gateway test-mode checkout and callback delivery; mocked refunds do not establish live execution |
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

## Database and deployment prerequisites

The `ganges-healers` and `ganges-healers-preview` Neon projects now belong to `gangeshealers@gmail.com` in Ganges. The production-named project retains four branches and its approved six-hour recovery window; preview retains its separate branch.

A read-only migration-history check on the transferred `ganges-healers` project found no successful entries for these development-line migrations:

- `20260322000000_restore_missing_baseline_models`
- `20260325120000_scale_readiness`
- `20261029000000_enrollment_price_snapshots`
- `20261031000000_restore_missing_columns_indexes`

Missing entries do not prove every corresponding schema object is absent. Compare the intended target schema, rehearse additive SQL on an isolated copy, and reconcile history before a reviewed deployment migration. Do not reset production or blindly mark migrations applied.

The current Vercel Production `DATABASE_URL` and `DIRECT_URL` point to a different endpoint from the transferred `ganges-healers` default production branch. They match the older Vercel Marketplace Neon store. Therefore the two completed project transfers do not establish migration of the database used by the existing live deployment. Identify and compare that database before any data cutover or production URL change. Preview variables match the dedicated transferred preview project, whose expected enrollment, analytics, and product columns were checked read-only.

Vercel's production deployment predates this combined feature work. Feature branches and passing tests do not establish a production rollout. Verify payment, email, upload, cron, and optional worker configuration at deployment; keep test shortcuts disabled in Preview and Production.

The Vercel Git connection was repaired from the old `pahadi-labs` owner to `ayushdarmoraa/ganges-healers`. The current Hobby plan rejects the feature branch's hourly and six-hourly cron schedules. A separate `codex/preview-store-course-5035361` branch disables scheduled jobs solely for Preview; the feature branch retains all five schedules. Choose a supported production scheduling arrangement before rollout. Preview currently has database and authentication variables but no Razorpay credentials, so deployed payment-provider validation is still pending.

## Release sequence

1. Finish combined-branch CI and address failures without weakening flow assertions.
2. Review stacked pull requests and reconcile database prerequisites on an isolated copy.
3. Validate a Vercel Preview with its dedicated database, customer/healer/admin roles, enrollments, and payment test-mode flows.
4. Roll out reviewed application/migrations with rollback or roll-forward steps, then check production health, authorization, callbacks, logs, and customer journeys.

See `docs/GUARDRAILS.md`, `docs/contracts.md`, and `docs/deployment.md`. Git Bash update commands for the Windows checkout are in `README.md`.
