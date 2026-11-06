# Ganges Healers — Implementation and Rollout Status

Reviewed November 6, 2026 against the attached implementation plan and system design, current release source, recent commit history, pull requests and CI. Vercel access is now authorized. Historical checks below describe their recorded commits; PR #10 tracks the current protected Preview and production readiness.

## Current development line

The release candidate is `codex/site-completion-release` in [PR #10](https://github.com/gangeshealers/ganges-healers/pull/10). It preserves the existing Next.js App Router application. Recent implementation-plan follow-ups are [recovery hardening #12](https://github.com/gangeshealers/ganges-healers/pull/12), [checkout recovery #13](https://github.com/gangeshealers/ganges-healers/pull/13), [dependency fixes #14](https://github.com/gangeshealers/ganges-healers/pull/14), [program scheduling and calendar exports #15](https://github.com/gangeshealers/ganges-healers/pull/15), and [authenticator security #16](https://github.com/gangeshealers/ganges-healers/pull/16). The linked PRs record their exact tested source and seven-job CI results; PR #10 records the final combined validation. Earlier dated/checkpoint notes below are history, not current unresolved CI gates.

The account-closure change merged in [PR #34](https://github.com/gangeshealers/ganges-healers/pull/34).
The protected Preview database was checked before merge. It has the exact
closure migration and 27 applied migrations. The service catalog validation in
[PR #35](https://github.com/gangeshealers/ganges-healers/pull/35) was checked
against that combined source. The marketplace follow-up adds review-based
filtering to the public service page and API, and makes rejected healer and
program edits recoverable in their admin forms.

| Plan area | Credential-free implementation in this candidate | Outside the current work scope |
| --- | --- | --- |
| Foundation | Additive migrations, exact SQL/data-preservation rehearsals, guarded disposable test databases, CI, health route, structured logs | Fresh production-data cutover, provider configuration and deployed verification |
| Accounts and profiles | Registration, password sign-in/recovery, role guards, profiles and availability; authenticator protection; email and phone verification; reviewed closure with recent sign-in, commitment checks, retained history and session revocation | Google credentials/callback setup; actual email/SMS delivery; deployed acceptance |
| Marketplace and bookings | Discovery with review-based rating filters, capacity checks shared with programs, creation/rescheduling/cancellation, credit confirmation, calendar downloads | Live payment/refund delivery and deployed smoke checks |
| Payments and memberships | Server-priced owned checkout, verified webhooks, idempotent fulfillment, invoice/access checks, immutable membership/program quotes and retry recovery | Gateway credentials, real checkout and webhook delivery |
| Programs and courses | Catalogs, paid/free enrollment rules, owned lesson progress; program practitioner assignment, reservations, cancellation, guarded completion/progress and pause/resume | Remote meeting provisioning and live purchase delivery |
| Community and content | Topics/tags, drafts, administration, moderation/report review, blog publishing/withdrawal | Owner-supplied published content and deployed role smoke checks |
| Notifications and navigation | Inbox/read state, bells, polling/socket authorization, search, account menus and cart | External email/SMS providers and deployed responsive checks |
| Store | Catalog/checkout, owned order details, filters/paging, saved line totals, staff shipment and delivery recording, customer tracking | Real gateway checkout and operational fulfillment checks |
| Administration and analytics | Admin workspaces, validated service/healer/program edits with draft recovery, access controls, payment reports, funnel/events, experiments and products | Production data/provider configuration and live monitoring |

The implemented candidate and passing isolated checks do not establish production deployment or completion of unspecified future sprint placeholders. No owner credential entry is needed for the changes above. The current production audit and remaining upstream finding are documented in `docs/ops-checklist.md`.

## November 6 source recheck and continuation

The recheck followed the recent release history through `7b93330`, including
recovery/MFA, checkout retries, weekly availability, course and lesson authoring,
private session links, product-photo recovery, order/catalog retention, audited
benefit edits and audio drafting/publication. These existing implementations
must be extended rather than duplicated. The current release source tree
`04e09f408d1648ed43b435c5e8b8a18d30917412` passed all seven CI jobs in run
`42208326563` (715 unit, 360 UI, 331 database and 42 browser tests, plus six
operational checks, build and dependency gate). The earlier release run's
mobile sign-out fixture race is historical: the current source isolates role
sessions. That upstream fix is preserved by this follow-up.

One remaining Sprint 2 gap was concrete: `emailVerified` existed without a
customer verification/resend flow. This follow-up adds owner-bound settings
controls, trusted expiring links, shared delivery cooldowns and atomic one-use
confirmation using the existing mail service and token table. It changes no
login, MFA or payment entitlement rules and requires no new dependency or
migration. Local unit/UI/static checks and dedicated PostgreSQL/browser cases
accompany the change; actual mail-provider delivery remains unverified. This
source follow-up performs no hosting or production-data action.

The phone/OTP follow-up now adds owner-bound settings, explicit SMS consent,
provider-approved checks, persistent resend/attempt limits and atomic proof
clearing on phone changes. Its additive migration was rehearsed on an isolated
child branch with all 46 original application tables and 25 earlier migration
records preserved. Actual SMS configuration/delivery remains outside this
developer batch; missing configuration is shown truthfully as unavailable.
Local verification passed 792 unit and 395 UI tests, TypeScript, focused lint,
browser discovery and six operational checks. Full database/browser CI and
release-Preview migration application must be recorded in the follow-up PR.

The account-closure follow-up implements the system-design API as a reviewed,
history-preserving access closure. It requires a recent normal sign-in and
explicit confirmation, rechecks current commitments, refuses staff/practitioner
self-closure, and atomically revokes sessions/recovery while auditing the
change. Closed accounts cannot regain access through password, Google,
authenticator, recovery or socket paths. This does not claim data erasure,
cancellation, refunds or actual provider delivery. Its nullable `closedAt`
migration must be rehearsed/applied before matching code. The follow-up PR
records current CI, migration and exact-source evidence.

Further regression review of older staff forms remains possible; it is not a
separate specified feature. Operational acceptance still needs actual gateway checkout /
webhook / refund delivery, email/SMS, configured Google login, final licensed
course/audio media, automated remote meetings where required, worker/monitoring
checks, load/Core Web Vitals measurements and backup recovery drills. A fresh
live-data/schema-history cutover is still required before production. Existing
provider setup or isolated fixtures do not establish these acceptance results.

The plan details Sprints 1–4 but replaces Sprint 5 onward with a continuation
placeholder despite announcing 12 sprints. Do not invent missing acceptance
criteria or claim a precise whole-project completion percentage.

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

The initial dependency follow-up left four advisories visible. The reviewed
compatibility follow-up fixes the high and two moderate findings with scoped
resolutions for deepmerge-ts 8, glob 14 and minimatch 11. The current audit is
0 critical, 0 high, 0 moderate and 1 low. The upstream low-severity deepmerge
finding has no published fix and remains visible in `docs/ops-checklist.md`.
CI rejects high and critical findings; full checks must pass before merging.

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


## Availability manager completion

Implementation-plan Sprint 3 Day 30 now uses shared weekly-hour validation in
the healer editor and reservation engine. Saved hours before 10:00 or after
20:00 are reflected in customer slot selection, appointment duration must fit
before closing, and passed starts/days off are unavailable. Existing appointments
retain their reserved times when hours change.

Private schedule snapshots and conditional saves prevent stale edits from
silently overwriting another session. Saves share the reservation advisory lock
and recheck ownership/current role. Failed loads cannot save blank schedules;
failed/conflicted saves preserve the draft, and account changes clear it. The
GET schedule endpoint, additive response version, legacy minute-window handling,
API compatibility and rollback are documented in `docs/contracts.md`. No schema
change, dependency, provider credential or Vercel operation is included.


## Course authoring and purchase preservation

The existing administrator course page now supports private draft creation,
validated metadata, lesson text/HTTPS video editing, lesson ordering, explicit
publication and archival. A new course starts unpublished; publication requires a
complete curriculum. Saved versions prevent competing administrators from silently
overwriting each other. Failed saves preserve drafts, and pending text blocks
publication until saved. The API is current-role guarded and private/no-store.

Any enrollment or course-bound payment record protects the course from deletion
and structural curriculum changes. Content corrections remain possible. Archiving
stops discovery and new enrollments while active/completed students retain their
course, lesson and progress access. Course allocation shares the catalog lock with
these administrative decisions and rereads publication state before reserving a
quote. Purchased prices and the existing progress representation stay unchanged.

Validation and exact commit results are recorded in the follow-up pull request.
No schema migration, dependency, provider credential, real payment or fabricated
course content is introduced. Licensed course media remains owner supplied.

The Vercel release Preview's isolated database now has all 24 committed migrations,
including program reservations and authenticator security. All original
application rows were preserved during that separate branch upgrade. The latest
Preview and its verification are recorded in PR #10; this remains an older data
snapshot rather than a synchronized production source. Production configuration
and identification of the authoritative live dataset remain outstanding.


## Ordinary session delivery

Assigned practitioners can save, replace or clear an HTTPS meeting link for an
upcoming/ongoing confirmed appointment. The customer sees the same link in My
Bookings and private calendar exports; cancelled/completed cards do not advertise
a join action. No remote meeting is fabricated. Customer and healer displays use
explicit India time, and account changes clear private booking/link state.

Link saves require the saved booking timestamp and share the reservation advisory
lock. Ownership and current role are reread after waiting; competing/stale writes
retain drafts and cannot revive a cancelled session. Appointment, price, payment
and credit records remain unchanged by link editing. A safe audit records the
action without the URL or its access token. Failed loads/saves cannot claim success.

Practitioners can complete confirmed/rescheduled sessions only after the scheduled
end. Pending confirmation requires verified saved funding, an applied credit or
a genuinely free appointment. Practitioner cancellation of captured payments or
used credits now requires separate refund/credit review rather than silently
losing the customer's entitlement. Unpaid reservations retain their guarded
cancellation action. Existing customer cancellation/refund handling is unchanged.

Validation results and deployed Preview status are recorded in the follow-up pull
request. This adds no schema, dependency, remote-meeting credential or live charge.
Provider-owned meetings, actual email/payment delivery and the fresh production
cutover remain separate configuration and verification work.


## Product-photo upload completion

The administrator product form now preserves successful gallery uploads across
partial failures, offers explicit failed-image retries, blocks incomplete and
duplicate submissions, and retains drafts after save errors. Keyboard buttons and
labelled file inputs replace clickable upload containers. Account changes clear
the editor and abort pending uploads. Shared file rules align browser/server
validation below the platform request limit; server checks format signatures and
current administrator roles, uses generated paths and avoids provider-secret logs.

The public `ganges-product-photos-preview` Blob store is connected to the existing
Vercel project with OIDC, Preview only. Its prefixed metadata variables are scoped
to the release branch; no long-lived token was added. The upload route refreshes
identity per request and explicitly selects that dedicated store. Missing identity
cannot redirect uploads into shared invoice storage; existing dedicated-token and
unbound legacy-token deployments remain compatible. Invoice PDF uploads stay
disabled unless separately configured. No database migration or payment change is needed.
Validation and actual provider-provisioning/deployment status are recorded in the
follow-up pull request. The domain purchase and production configuration are later
launch steps; they do not block this website implementation and Preview testing.


## Store purchase-history protection

Administrator product deletion now protects order and bundle records instead of
cascading away purchase history. Confirmation uses the currently reviewed product
version; role changes, stale confirmations and new purchases are rechecked under
a database row lock before deletion. Purchased/bundled products keep the existing
Deactivate option. Safe deletion and its audit are atomic, failures are explicit,
and mobile product cards keep controls visible. Exact results are recorded in the
follow-up pull request; no schema, provider or payment-flow changes are required.


## Service and healer retention

The Services and Healers administrator pages now use reversible deactivation
instead of exposing permanent cascade deletion. Both the old buttons and their
unguarded private server actions are retired. Existing bookings, payment/refund/
invoice chains, reviews, linked products, program assignments and healer user
accounts remain intact. Administration can still edit, verify and reactivate
records. The browser regression snapshots these related records through actual
deactivation actions and verifies that the customer still has the appointment
and its private calendar. No migration or provider credential is required.

## Sign-in feedback and independent development

A read-only check of the connected release Preview database found no website
account matching the email used in the failed browser attempt. Vercel account
access does not create an application account. Website development continues
without making browser sign-in an owner action gate. The sign-in page now keeps
failure feedback visible, clears secret inputs after attempts, preserves email
and recovery links, and prevents duplicate submissions. Existing real-password,
MFA and administrator authorization checks remain intact; no demo login or
privileged account is silently installed.

## Administrator benefit edits

The existing VIP/credit workspace validates whole nonnegative balances, requires
an audit reason and rejects stale reviewed data. Stable actor/account row locks
serialize saves with credit consumption and recheck current administrator roles.
Benefits and their before/after audit commit together; subscription terms,
credit ledgers, payments, credentials and roles remain intact. The editor retains
failed drafts, requires reload after conflicts, blocks duplicate submissions and
clears on account changes. Disposable-database and real-password administrator
browser fixtures verify these workflows without requiring owner browser sign-in.
No schema, provider credential or production-data change is required.

## Audio authoring and publication

Administrators can create private audio drafts, edit metadata/media URLs, publish
and withdraw from the existing audio library. Content versions and transaction
locks reject stale writes; current roles are rechecked, and edits/publication
commit with an audit. Failed drafts remain available for retry or explicit reload.
Published visibility is enforced in playback, metadata, library/home discovery,
search, service links and sitemaps. Premium rules remain tied to current VIP or
active program/course access. Player account changes discard old media and
ignore late responses. No provider credential is required to manage licensed,
externally hosted HTTPS media URLs.

The additive publication migration preserves legacy visibility by default and was
rehearsed on an isolated Neon child branch with an unchanged legacy-row fingerprint.
Release Preview application and deployed verification are recorded in the audio
follow-up PR. No production connection/domain or owner account change is required.
