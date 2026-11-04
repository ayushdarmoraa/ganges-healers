# Live database migration rehearsal

Verified on November 4, 2026. This is a rehearsal record, not a completed production cutover.

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
