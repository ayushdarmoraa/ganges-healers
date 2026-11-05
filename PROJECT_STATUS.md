# Ganges Healers — Implementation and Rollout Status

Reviewed November 5, 2026 against the implementation plan, repository branches, pull requests, CI and database rehearsal records. Current work excludes Vercel. Earlier Preview checks below are historical and do not establish deployment of the latest source.

## Current development line

The published release branch is `codex/site-completion-release` in PR #10. It consolidates the earlier community, publishing, notifications, navigation, store/course, authentication, membership, payment-recovery, refund-reconciliation, public-privacy, completed-session-review and booking-return work. The application remains the existing Next.js App Router project. Recovery hardening (PR #12) and course/program checkout recovery (PR #13) are merged. CI run 42088716885 verified combined source tree `5f6b6f2ebaeebd3171f58c19a9ce12d85549b1d5`: 538 unit, 242 integration, 267 UI, 32 browser and 6 operations checks, plus the production build. Only the existing legacy integration placeholder is skipped. These are isolated CI checks; actual email/payment delivery, deployment of this source, and production cutover are unverified.

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

## Earlier store and course batch

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
- Full CI for PR #8 passed all six jobs. The later PR #9 result below validates the combined development line.
- Preview-only membership side effects were enabled in the earlier workspace on the isolated verified copy with test-mode credentials. That does not configure payments in the new Ganges-owned workspace. A real gateway test charge/callback and production configuration remain release gates; a configured key or synthetic signed test does not prove provider delivery.

## Payment recovery batch (PR #9)

- Verified captured events finish server-owned booking, course, program and store purchases even when the browser callback is lost. Amount, currency, resource and customer bindings are checked inside the existing transaction; retries cannot grant stock/access twice. Invoice retries run after fulfillment commits.
- Anonymous membership checkout returns to sign-in and then the membership screen. Membership refresh uses a stable callback so session refresh does not loop requests.
- CI run 41970494620 at `3ee260c` passed all six jobs: 382 unit, 208 integration, 205 UI, 27 browser and 6 operations checks, plus the production build. All browser checks ran; only one legacy integration placeholder is skipped.
- The protected Ganges-owned Preview built successfully from this commit. Browser checks confirmed the homepage, database health and configured credentials provider. This does not verify a real payment or production rollout.

## Refund reconciliation follow-up

- Add a shared transactional outcome writer for cancellation responses and verified refund events. Keep confirmed outcomes terminal, bind provider IDs/amount/currency to stored records, serialize refunds per payment, and mark only fully covered payments refunded.
- Never submit money from a webhook. Request retries when delivery precedes saving a known payment's refund ID; unrelated payments are ignored without guessed customer bindings. Invalid data and transaction failures retain the existing retry response.
- Extend cancellation regression tests and add webhook replay, stale-status, ownership/amount, partial/full total and concurrency coverage. The new `src/lib/payments/refunds.ts` keeps transactional state reconciliation separate from the existing provider SDK adapter and is used by both the webhook dispatcher and cancellation route; new refund unit coverage is separate from the subscription suite.
- Local verification: all 402 unit tests and 205 UI tests pass, as do TypeScript, focused ESLint and diff checks. Eight new database-backed webhook/race cases extend the existing cancellation transaction suite. The dedicated test database's read-only identity check could not connect from this workspace, so those integration cases and a new production build still need CI. No database reset or production write was attempted. No schema or dependency change is required; revert this patch to roll back its behavior.

## Verified-session reviews follow-up

- Connect the existing Review model to a customer submission flow in My Bookings. Only the owner of a completed session after its scheduled end can submit; self-reviews and foreign bookings are rejected. The server derives all resource IDs, validates 1–5 integer ratings and bounded optional comments, and preserves plain-text rendering.
- Use one transactional service in `src/lib/bookings/reviews.ts` behind the new booking review route. The existing healer lock serializes duplicate reviews and rating-average updates. Identical retries return the accepted record; conflicting replacements are rejected. A separate form component is reused by booking cards rather than growing the bookings page with editor state.
- Replace the service catalog's synthesized 5.0 rating with one batched aggregate of actual reviews. Service healer cards and booking dialogs no longer show ratings when there are no reviews. Existing bookings/payment/cancellation API contracts remain; the owned bookings list adds its saved review.
- Local verification: all 424 unit and 216 UI tests pass, along with TypeScript, focused ESLint and diff checks. Browser UI checks use the actual bookings components with explicitly labeled sample data and simulated API responses; they do not establish database or provider delivery. The form saves and displays its result, and its controls fit a 390-pixel mobile frame without horizontal overflow. Malformed responses preserve the draft instead of reporting an unconfirmed save. Four new real-database transaction cases and one booking-to-public-review browser journey are ready for CI, but were not run because the dedicated database identity read remains unreachable. Browser test discovery passed. No schema or dependency changes are needed.
- The next release work remains publication of the stacked local branches, database-backed CI and preview verification, followed by fresh-data migration and provider configuration. Current deployed Preview still runs PR #9. A configured preview or passing local UI suite does not establish completion of the production website.

## Public marketplace privacy follow-up

- Replace the public service endpoint's raw booking/account export with explicit public field projections, both in Prisma selection and JSON output. Preserve the legacy bookings array as public practitioner summaries only; document removed private fields and the authenticated booking API for customer details.
- Service API averages/counts now use actual service reviews. Preserve its numeric unrated value, envelope, error responses and administrator mutations. Practitioner deduplication uses a map rather than a quadratic search.
- Exclude inactive practitioners from public details and service cards, and omit inactive service links from practitioner profiles/directories.
- Local verification: all 434 unit and 216 UI tests pass, as do six existing mocked healer API checks, TypeScript, focused ESLint and diff checks. Ten new unit regression cases cover data projection, unknown private fields, query selection, truthful ratings and inactive profiles. A new real-database privacy/visibility case extends the services integration suite and awaits CI with the earlier local follow-ups. No migration or dependency changes; no production write/deployment was performed.

## Booking and authentication continuity follow-up

- Carry the selected practitioner from a healer profile into service booking. An explicitly unavailable/ambiguous choice never falls back to someone else. Preserve generic service auto-open links and existing program/product contexts; remount the flow when the selected healer changes.
- Signed-out confirmation returns to the chosen service/practitioner after sign-in, without creating a booking or preserving a stale slot. Require a nonempty customer ID and wait for loading sessions before confirmation.
- Honor validated local return URLs for password and configured Google sign-in, registration links and registration success. This also completes the membership sign-in return path. The new shared pure helper belongs to authentication routing and is reused by client and server consumers; external, ambiguous and looping destinations default safely to the dashboard.
- Local verification: all 463 unit and 230 UI tests pass, as do TypeScript, focused ESLint and diff checks. New coverage includes 29 callback validation cases and 14 UI scenarios for selected practitioners, signed-out/loading sessions and credentials/Google/registration returns. Browser discovery includes the existing real-password flow and a new profile-selection → registration → real-sign-in journey with two competing practitioners. Real database/browser execution and a new production build remain pending CI; discovery is not an end-to-end pass. No schema/dependency changes or provider/payment behavior changes.

## Public healer presentation follow-up

- Use accepted session reviews for the public healer API, directory, profiles and homepage; preserve numeric rating averages and add review counts. Read one bounded aggregate for the displayed healer IDs and show “No reviews yet” instead of legacy seeded stars. Featured practitioners remain active/verified and are ordered by actual review count with a stable ID tie-breaker.
- Public certifications support existing plain strings and saved name objects, omit malformed/blank entries, and deduplicate names instead of rendering “[object Object]”. Keep the public string-array contract and ordinary escaped rendering.
- Local checks: 470 unit and 232 UI tests, six mocked healer API checks, TypeScript, focused ESLint and diff checks passed. The new database regression proves public ratings ignore a stale stored score and count accepted session reviews. This follow-up awaits its own CI and deployment validation; the complete preceding release passed the CI run above. No schema, dependency, payment or provider-credential changes.

## Database ownership and rollout

### Recovery identity and retry follow-up

- Extend the existing recovery flow with unambiguous account selection and current-email binding. A link cannot reset an account whose email changed, including an email update racing confirmation.
- Failed issuance or delivery releases only its own token and throttle reservation, allowing immediate retry without erasing a newer request. Malformed successful HTTP responses no longer claim delivery or a completed password change.
- Confirmed settings password changes sign the revoked session out; overlong UTF-8 passwords are rejected consistently. Existing credential-version checks and notification socket revocation remain in place.
- Extend the existing unit, UI, real-database transaction and browser fixtures. Local and CI results are recorded in the follow-up PR. No additional migration or dependency is part of this patch; no live data or Vercel settings were changed.

The `ganges-healers` and `ganges-healers-preview` Neon projects now belong to `gangeshealers@gmail.com` in Ganges. The production-named project retains four branches and its approved six-hour recovery window; preview retains its separate branch.

A read-only migration-history check on the transferred `ganges-healers` project found no successful entries for these development-line migrations:

- `20260322000000_restore_missing_baseline_models`
- `20260325120000_scale_readiness`
- `20261029000000_enrollment_price_snapshots`
- `20261031000000_restore_missing_columns_indexes`

Missing entries do not prove every corresponding schema object is absent. Compare the intended target schema, rehearse additive SQL on an isolated copy, and reconcile history before a reviewed deployment migration. Do not reset production or blindly mark migrations applied.

The earlier live Vercel deployment points to the older Vercel Marketplace Neon store, rather than the transferred `ganges-healers` default production branch. The read-only copy/rehearsal identified and compared that actual source, then verified original rows and an additive schema upgrade on an isolated Ganges-owned copy. The new Preview uses that copy. It is a snapshot, not a continuously synchronized replica; a production cutover still requires a fresh snapshot during write maintenance and repeated verification.

Vercel's production deployment predates this combined feature work. Feature branches and passing tests do not establish a production rollout. Verify payment, email, upload, cron, and optional worker configuration at deployment; keep test shortcuts disabled in Preview and Production.

GitHub ownership is now `gangeshealers/ganges-healers`, and the new Ganges-owned Vercel project is connected to that repository. Its protected Preview from PR #9 is ready; main still points to the older code and its new-workspace build failed because that code initializes Razorpay without credentials. The reviewed development line fixes this import-time failure. The new workspace has branch-scoped `DATABASE_URL`, `AUTH_SECRET` and `CRON_SECRET`; payment, email, upload and optional provider configuration remain outstanding. No production cutover has occurred. The release-readiness branch's daily cron expressions fit the existing Hobby plan; precise hourly messaging requires a different scheduler. The GitHub write connection is confirmed as gangeshealers. PR #10 contains the complete release. The existing DATABASE_URL, AUTH_SECRET and CRON_SECRET Preview secrets are now scoped to codex/site-completion-release; they remain write-only. The protected Preview built successfully after identity verification, and its database health check passed. Provider configuration and a fresh-data production cutover remain outstanding.

## Release sequence

Current release validation: password-recovery commit `ab7d435` passed all six CI
jobs in run `42078234321`: 511 unit, 225 integration, 237 UI and 30 browser
tests, operations checks and the production build. One existing integration
placeholder remains skipped. Its protected Vercel Preview is ready and database
health passed. Recovery adds the missing request/reset screens and API flow,
hashed expiring links, transactional replay protection and credential-bound
session revocation; configured email delivery remains unverified.

The service-discovery follow-up fixes a reproduced homepage dead end, derives
category filters from the active catalog, preserves URL state, validates price
bounds and makes all empty filtered results recoverable. Local validation passed
248 UI tests, TypeScript and focused lint; the new real-browser catalog journey
awaits its own CI/deployment. No schema, dependency or payment API changes.

1. Finish combined-branch CI and address failures without weakening flow assertions.
2. Review stacked pull requests and reconcile database prerequisites on an isolated copy.
3. Validate a Vercel Preview with its dedicated database, customer/healer/admin roles, enrollments, and payment test-mode flows.
4. Roll out reviewed application/migrations with rollback or roll-forward steps, then check production health, authorization, callbacks, logs, and customer journeys.

See `docs/GUARDRAILS.md`, `docs/contracts.md`, and `docs/deployment.md`. Git Bash update commands for the Windows checkout are in `README.md`.

## Enrollment recovery and release limits (PR #13)

Free course quotes activate enrollment without a gateway/payment row. Dismissed
paid course/program checkouts reuse the customer's saved enrollment, order and
quote. Allocation and payment locks coordinate concurrent requests and generic
checkout; terminal/inconsistent payments and ambiguous legacy program reservations
require review. Auth return paths, empty course lesson lists and explicit payment
verification are covered by UI tests. New database tests cover retry/concurrency;
the browser test enters a free course's gated lesson without provider requests.
No production database or hosting setting changes were made.

Program purchase activation currently produces schedule JSON; it does not reserve
actual practitioner appointments. Confirm the included service, practitioner
selection and scheduling policy before claiming program session delivery. Licensed
course/audio media and real email/payment/upload providers need separate checks.
The database rehearsal is an old snapshot; a fresh synchronized production cutover
remains necessary. See `docs/database-rehearsal.md` and PR #10.

## Dependency security follow-up

Update the existing framework/runtime families and the lockfile after the current
registry audit: Next.js 15.5.29, Auth.js beta.32 with matching adapter/core, React
19.1.10, Prisma 6.19.3, Sentry 10.78.0, and compatible runtime dependency fixes.
Targeted transitive resolutions include patched Sharp/PostCSS/socket/HTTP/validation
paths. The legacy unused auth adapter is removed, bcryptjs is a runtime dependency,
and the email CLI is development-only. A CI job rejects critical production
dependency advisories before the build. No schema or hosting settings change.

The final dependency audit reports 0 critical, 1 high, 2 moderate and 1 low findings.
The four residual advisories and their dependency paths are documented in
`docs/ops-checklist.md`; they are not hidden or declared fixed. Application tests
must pass against the new lockfile before this follow-up is merged.

## Program delivery and calendar follow-up

Implementation-plan Sprint 4 now has actual program-owned session reservations,
practitioner assignment, customer/healer/admin workspaces, pause/resume and guarded
session completion. This follows the plan's program-session entitlement model;
it does not grant arbitrary individual-service credits. Suggested JSON dates stay
proposals. Confirmed rows share ordinary booking locks/overlap checks; progress
and completion reflect reserved, ended sessions. Program terms freeze at checkout,
and later staff assignment preserves the original payment binding. Purchased
programs are archived rather than deleted.

Sprint 3 calendar support includes private iCalendar exports for bookings and
confirmed program appointments. The downloads need no provider account, new
secret or external message. Automated Google/Zoom provisioning remains outside
this credential-free scope. The additive reservation migration is included for
isolated SQL/data-preservation and application tests; production data and hosting
settings are unchanged. See `docs/contracts.md` for permissions, migration order
and rollback constraints.


## Authenticator security follow-up

Implementation-plan Sprint 2 Day 20 authenticator protection is implemented in
account settings and real password sign-in. Setup, activation, replay prevention,
one-time recovery codes, replacement/disable, account-scoped failures, and
existing-session revocation require no new owner credentials. Secret encryption
uses the application's existing authentication secret; QR creation is local.
Protected accounts cannot skip their factor through Google or password recovery.
Existing accounts remain unprotected until their owner enables it.

The additive MFA migration, exact SQL preservation test, real-browser enable /
login / recovery / disable journey, transaction concurrency tests, RFC vectors,
and UI failure tests accompany the implementation. See `docs/contracts.md` for
the deployment order and key/rollback constraints. Hosting, production migration,
provider setup, real email delivery and live charges are outside the current
credential-free work scope. No Vercel action is part of this follow-up.
