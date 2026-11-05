# Password recovery

The sign-in screen links to `/auth/forgot-password`. A customer can request a link,
choose a new password at `/auth/reset-password`, and return to their original local
booking or account destination through normal sign-in. Recovery never signs the
customer in automatically.

## Service configuration

Recovery uses the existing Resend email service and sender
`Ganges Healers <noreply@gangeshealers.com>`. Configure `RESEND_API_KEY` and verify
that sender domain. Set a stable HTTPS `NEXT_PUBLIC_SITE_URL`; the existing
`AUTH_URL` or `NEXTAUTH_URL` is accepted when the public site URL is absent.
HTTP is accepted only for a loopback host outside production. Incoming Host or
forwarded-host headers never determine reset links.

When email or the configured origin is unavailable, the request endpoint returns
the same `503` for every address. A generic accepted response does not establish
provider delivery. Background delivery failures use a fixed diagnostic without
logging the recipient, password or reset link. Failed delivery removes only the
token belonging to that attempt so a customer can retry.

## API contracts

- `POST /api/auth/forgot-password`: `{ email, callbackUrl? }`. Valid requests with
  configured services receive `200 { success: true, message }`. The response is
  independent of account existence; account lookup and delivery run through
  Next.js `after` after that response. Invalid input returns `400`; unavailable
  service configuration returns `503`.
- `POST /api/auth/reset-password`: `{ token, newPassword }`. A committed change
  returns `200 { success: true }`. Invalid, expired, consumed or identity-mismatched
  links return `400`; unexpected persistence errors return `500` with a fixed
  public message. Successful responses are not cached.
- The existing `/api/users/me/password` success contract remains
  `{ success: true }`. It now also revokes old sessions and reset links. A
  concurrent password replacement returns `409`, requiring fresh sign-in.

New passwords preserve the application's six-character minimum. Input exceeding
bcrypt's 72-byte UTF-8 capacity is rejected instead of silently truncated.

## Token and session lifecycle

Tokens contain 256 random bits, expire after 15 minutes and are stored only as
SHA-256 digests in the existing `VerificationToken` table. Their identifiers bind
the account ID and a digest of its normalized email. Unknown, OAuth-only and
ambiguous mixed-case accounts do not receive links. Account-level issuance is
serialized and limited to one email per minute across processes, alongside the
existing per-process IP middleware rate limiter.

Reset tokens travel in the email URL fragment, which browsers do not send to the
server or in Referer headers. The form reads and immediately removes that fragment,
then submits the token only in the reset POST body. Reloading a cleared page
requires reopening the email link. Recovery pages set `no-referrer`, are excluded
from indexing and do not load the site's advertising pixel.

Issuance, redemption and ordinary password changes share the existing transaction
lock helper's credentials namespace. Redemption atomically consumes its token,
updates the password hash and `User.passwordChangedAt`, and removes other reset
links for that account. Concurrent attempts cannot both replace the password.
Email changes invalidate previously issued links through their identity binding.

The JWT callback reads `passwordChangedAt` in its existing account lookup. A
verified new sign-in captures the current version; subsequent reads reject any
different version. This also invalidates legacy cookies that have no version when
the password changes. Client session updates cannot change that version.

## Migration and rollout

Apply `20261105180000_password_session_revocation` before using this application
version. It adds one nullable timestamp column and does not backfill or alter
existing passwords or account records. Test it on an isolated copy and reconcile
the earlier release migrations before deploying the complete release. Do not
reset a live database or substitute an older snapshot for current production data.

Application rollback can leave the unused nullable column in place. Keep its
values and the verification records; roll forward to restore recovery behavior.
The older application does not enforce the added password-session version.

The exact additive SQL was rehearsed on November 5, 2026 on Neon branch
`codex-password-recovery-20261105`, derived from the existing isolated live-data
rehearsal. All eight account rows retained the same fingerprint across their
original columns, and the added timestamp was null for all existing accounts.
The schema diff shows the new nullable column and branch-specific default grants;
the migration itself changes only that column. Neither the parent rehearsal nor
the live application database was modified. This temporary branch expires after
24 hours.

The test suite separates mocked provider delivery, real PostgreSQL transactions,
and a browser reset/sign-in/session-revocation journey with an explicit isolated
delivery fixture. None of those tests establishes real email delivery.

Security reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
