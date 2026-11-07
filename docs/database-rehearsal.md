# Live database migration rehearsal

Verified on November 4, 2026. This is a rehearsal record, not a completed production cutover.

## Account closure rehearsal (November 6, 2026)

`20261106190000_account_closure` adds only a nullable `User.closedAt` column.
Its exact SHA-256 is
`9e5603d181e94519cd3db87962acf64c7916c36f5dcb8436f25b2e66587a83a9`.
It was rehearsed on `br-patient-term-adpfp17j`
(`codex-account-closure-20261106`), copied from the existing release Preview
`br-winter-sun-ado4pted` in `holy-block-51695227`.
Repeatable-read checks inside the migration transaction preserved all 47
original application-table counts/original-field fingerprints and all 26
earlier migration records. The rehearsal has 27 complete migrations, a nullable
column and no closed accounts. The follow-up PR records application to the
development release Preview before matching code is merged. No production
migration, account closure, connection change or data deletion is part of this
rehearsal.

## Phone verification rehearsal (November 6, 2026)

The additive `20261106142000_phone_verification` migration was rehearsed on
`br-dawn-salad-adi139rl` (`codex-phone-verification-20261106`), copied from the
existing release Preview `br-winter-sun-ado4pted` in `holy-block-51695227`.
Its exact SHA-256 is
`c09c0797e244cf97c406753ef1002e5d74d439b782fa1506c99358f1aca172ce`.
The schema diff contains only two nullable User fields and a new per-account
challenge table with its primary/foreign keys. All 46 original application-table
counts and original-field fingerprints match the parent; all 25 earlier
migration records are unchanged. The 26th migration is recorded, the challenge
table is empty and no legacy phone was marked verified. PR #33 records the
subsequent exact transactional application to the development release Preview,
with all 46 original tables and 25 earlier migration records preserved and an
empty schema comparison against the rehearsal. Production is unchanged.

## Database mapping

The existing production deployment uses the older Vercel Marketplace Neon resource. The separately transferred production-named Neon project has a different schema and dataset. Switching the production connection string to that project's default branch would omit existing application records.

A dedicated child branch in the Ganges project now holds a verified copy in `ganges_live_rehearsal_20261104`. The release-auth-readiness Preview alone uses that database through branch-specific environment variables. Other Preview variables and production connections retain their separate scopes.

## Verified results

1. The source connection enforced `default_transaction_read_only=on`.
2. `pg_dump` / `pg_restore` copied the existing 36-table database into a newly created database on the isolated branch. No reset, cleanup, overwrite or schema change ran on the source.
3. Every original table's count and sorted row fingerprints matched before and after the copy. Raw account data, password hashes and connection strings were not logged.
4. Prisma 6.16.2 generated 45 additive statements. Review found only table/index creation and added columns/constraints. The SQL is preserved in `scripts/sql/rehearsal-upgrade-20261104.sql`.
5. Those statements were applied in a transaction on the copy. Its 45 public tables match the application schema. All original columns/rows still matched the source; new columns were excluded from that preservation comparison.
6. Historical checksum differences matched CRLF versus LF variants exactly. After the schema comparison returned no differences, eight unrecorded migration entries were reconciled on the copy. Its 22 migration records are complete, and `prisma migrate deploy` reports no pending migrations.

Existing accounts, bookings, payments, invoices, refunds, memberships, plans, healers and services were preserved. Aggregated verification output is retained with the private work session; production row data is not stored in this repository.

## Repeat the copy safely

The dedicated `scripts/rehearse-live-database.py` helper is separate from the disposable test database reset/seed tool. It requires Python 3 and PostgreSQL client commands (`psql`, `pg_dump`, `pg_restore`). Supply secrets through environment variables, never command arguments or committed files:

- `SOURCE_DATABASE_URL`: direct source connection.
- `REHEARSAL_ADMIN_DATABASE_URL`: direct connection to an isolated destination branch.
- `REHEARSAL_EXPECTED_HOST`: independently verified destination compute hostname.
- `REHEARSAL_DATABASE_NAME`: optional new name matching `ganges_live_rehearsal_YYYYMMDD` (optional lowercase suffix).

Run `python3 scripts/rehearse-live-database.py`. It refuses a shared source/destination host, a mismatched hostname pin, an unsafe database name, an existing destination, and a source that is not read-only. It exports no credentials or rows. The temporary archive contains private data, uses a private temporary directory, and is removed after restore.

The helper copies data only. Re-generate and review the schema diff for each fresh snapshot before upgrading it. The saved SQL is specific to the verified legacy schema and must not be treated as a universal migration. Reconcile history only after establishing schema equivalence and checking data backfills. Do not rewrite existing migration files or blindly mark migrations applied.

## Production release procedure

1. Establish a write-maintenance window so no registration, booking, checkout, webhook or administrative write can arrive during the final snapshot and switch.
2. Repeat the verified copy against a fresh destination and confirm all row fingerprints. Apply reviewed additive upgrades, reconcile proven history differences, and check the schema again.
3. Deploy the tested application with the selected production database and intended live-provider configuration. Keep test shortcuts disabled. Test-mode gateway verification does not establish live payment readiness.
4. Verify health, signed-in customer/healer/admin authorization, booking/payment journeys, invoices, provider callbacks and scheduled work before reopening writes.
5. Keep the old database and deployment available for recovery. A rollback after new writes requires reconciliation of those writes; changing a connection URL alone is not a lossless rollback.

The isolated rehearsal database is a snapshot. It does not continuously receive subsequent production writes. Do not promote it as current production data without a fresh synchronized cutover.

## Audio publication rehearsal (November 6, 2026)

The exact additive migration `20261106103000_audio_publication` was applied and
recorded transactionally on `codex-audio-publishing-20261106`
(`br-solitary-dream-ad3xhc2b`), forked from the existing release Preview branch
`br-winter-sun-ado4pted` in project `holy-block-51695227`.
Its SHA-256 checksum is
`38adb9069a5532f47d93423a5c053e01ba11f68c505de70254de46b8df694172`.
A legacy-shaped rehearsal fixture retained the same original-field fingerprint
and received isPublished=true. The schema comparison shows only the new boolean
and its publication/date index. Production is unchanged. The follow-up PR records
CI, preservation checks and application to the release Preview; this rehearsal
record alone does not claim that deployment is complete.

## Store checkout recovery rehearsal (November 7, 2026)

Migration `20261107010000_store_checkout_recovery` adds nullable `Order.checkoutKey`
and a unique `(userId, checkoutKey)` index. Its SHA-256 checksum is
`b55f3ac554242e71a02b6956cd419f1477411d51879d84a3c824242d1b0de2d5`.
A populated disposable PostgreSQL rehearsal retained all original fields of three
orders, three order items and three payments byte-for-byte as JSON snapshots;
the existing orders received null keys and the unique index was verified.

The same tracked SQL was applied transactionally to release Preview branch
`br-winter-sun-ado4pted` in project `holy-block-51695227`, database
`ganges_live_rehearsal_20261104`, after verifying the 28-migration baseline and
the preceding fulfillment migration checksum. Table locks, timeouts and original
order/item/payment fingerprints guarded the change. Independent verification
confirmed 29 applied migrations, the exact checksum, nullable column and unique
index. This is additive Preview preparation; production application remains part
of the fresh cutover procedure above.
