# Deployment Guide

This guide covers deploying Ganges Healers to production on Vercel with supporting services.

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [pnpm 10+](https://pnpm.io)
- A [Vercel](https://vercel.com) account
- A [Neon](https://neon.tech) or PostgreSQL database
- A [Razorpay](https://razorpay.com) account (payments)
- (Optional) [Upstash Redis](https://upstash.com) for background jobs & caching
- (Optional) [Resend](https://resend.com) for transactional email
- (Optional) [Sentry](https://sentry.io) for error monitoring

---

## 1. Database Setup (Neon PostgreSQL)

1. Create a Neon project at <https://console.neon.tech>
2. Copy the connection string (pooled endpoint recommended)
3. Run migrations:

```bash
DATABASE_URL="<your-connection-string>" npx prisma migrate deploy
```

4. Seed demo data (optional):

```bash
DATABASE_URL="<your-connection-string>" pnpm seed
```

> **Note:** The project uses manual migrations. Never run `prisma migrate dev` against production — only `prisma migrate deploy`.

---

## 2. Environment Variables

Copy `.env.example` and fill in all values. At minimum you need:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth session signing key (`openssl rand -base64 32`) |
| `RAZORPAY_KEY_ID` | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook verification secret |
| `CRON_SECRET` | Secret for authenticating cron endpoint calls |

Set these in Vercel under **Project → Settings → Environment Variables**.

### Google sign-in (optional)

Set both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to enable Google. The legacy pair `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` is also supported. Configure the exact `/api/auth/callback/google` URL for the deployment's stable hostname in the Google OAuth client. Secrets stay on the server. The sign-in screen discovers enabled providers from Auth.js and offers Google only when configured. Google identities must have a verified email; password verification and account-linking protections remain enabled.

### Preview payments

Preview uses a separate database and authentication secret. Its Razorpay variables must be test-mode credentials: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Test credentials added to the earlier Vercel workspace on November 4, 2026 do not establish configuration of the new Ganges-owned workspace. Its verified November 5 Preview has only branch-scoped database, authentication and cron secrets. Deploy again after environment changes, and configure a test-mode webhook for the Preview hostname before gateway callback verification. A configured key is not proof that a checkout or callback succeeded.

See `.env.example` for the full list including optional variables.

---

## 3. Vercel Deployment

### Initial Setup

```bash
# Install Vercel CLI
pnpm add -g vercel

# Link to project
vercel link

# Deploy
vercel --prod
```

### Automatic Deployments

Connect your GitHub repository in the Vercel dashboard. Every push to `main` will trigger a production deployment.

### Build Configuration

The project uses these defaults (auto-detected by Vercel):

- **Framework:** Next.js
- **Build Command:** `next build --turbopack`
- **Install Command:** `pnpm install` (runs `prisma generate` via postinstall)
- **Output Directory:** `.next`

### Security Headers

Security headers (X-Frame-Options, X-Content-Type-Options, etc.) are configured in `vercel.json`.

---

## 4. Razorpay Configuration

1. Create a Razorpay account and get test/live API keys
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in environment
3. Configure webhooks in the Razorpay dashboard:
   - **URL:** `https://your-domain.com/api/payments/webhook`
   - **Events:** `payment.captured`, `subscription.activated`, `subscription.charged`, `subscription.paused`, `subscription.resumed`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `refund.created`, `refund.processed`, `refund.failed`
   - Refund updates reconcile saved gateway refund IDs; they never submit another refund. Test duplicate and delayed delivery, a partial refund, and full confirmation before enabling production side effects. Keep the same raw-body signature verification. A retryable `apply-error` for a known payment with no bound refund ID requires checking the saved submission response or reviewing an untracked dashboard refund; do not create another refund to clear the error. See `docs/contracts.md`.
   - **Secret:** Use the same value as `RAZORPAY_WEBHOOK_SECRET`
   - **Application:** Enable `PAYMENT_EVENTS_ENABLED=true` only for the environment whose callback has been verified. See `docs/membership-fulfillment.md` for quote binding, single-cycle billing, reconciliation, and retry contracts.
4. Create subscription plans in the Razorpay dashboard matching the `MembershipPlan` slugs (`vip-monthly`, `vip-yearly`)

---

## 5. Redis & Background Jobs (Optional)

The app works without Redis — queues and caching gracefully degrade. For production workloads:

1. Create an Upstash Redis instance or any Redis-compatible service
2. Set `REDIS_URL` in environment variables
3. Background jobs (email, notifications, activity logging) are processed by BullMQ workers
4. To run the worker process separately:

```bash
pnpm worker
```

On Vercel, background jobs run in-process. For heavier workloads, deploy a separate worker on Railway, Render, or a VPS.

---

## 6. Email (Optional)

1. Sign up at [Resend](https://resend.com)
2. Add and verify your sending domain
3. Set `RESEND_API_KEY` in environment variables

Without `RESEND_API_KEY`, email functions log to console instead of sending.

---

## 7. Sentry Error Monitoring (Optional)

1. Create a Sentry project (Next.js platform)
2. Set these environment variables:
   - `NEXT_PUBLIC_SENTRY_DSN` — client & server DSN
   - `SENTRY_DSN` — server-only DSN (can equal `NEXT_PUBLIC_SENTRY_DSN`)
   - `SENTRY_ORG` — organization slug (for source maps)
   - `SENTRY_PROJECT` — project slug

Source maps are uploaded automatically during build when `SENTRY_ORG` and `SENTRY_PROJECT` are set.

---

## 8. Blob Storage (Optional)

Product photos use a public Vercel Blob store. Connect the existing store to the
project with OIDC, Preview only, and custom prefix `PRODUCT_IMAGES_BLOB`; leave
the read-write-token option unchecked. Scope the generated
`PRODUCT_IMAGES_BLOB_STORE_ID` and `PRODUCT_IMAGES_BLOB_WEBHOOK_PUBLIC_KEY` variables
to `codex/site-completion-release`. The upload route explicitly uses the dedicated
store ID and obtains a refreshed short-lived identity with `@vercel/oidc` for each
request. The webhook public key is connection metadata; this route does not need
a webhook. Use a separate connection for a later production rollout. Uploads accept
JPEG, PNG and WebP up to 4 MiB each, with format-signature validation and generated
object names. The gallery permits eight images. This leaves multipart overhead
below Vercel's request limit. A missing binding/identity returns 503 and keeps the draft.

An explicit server-only `PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN` remains supported
for token-based deployments or when dedicated OIDC identity is unavailable.
`BLOB_READ_WRITE_TOKEN` remains a legacy product-upload fallback only when no
dedicated store ID is configured, and controls existing invoice PDF uploads.
A configured dedicated store never falls back to that shared invoice token.
Do not set the shared key merely to enable product
photos: the current invoice hosting/redirect contract needs a separate privacy
review. A dedicated product-photo connection does not enable invoice uploads. No upload
credential belongs in a `NEXT_PUBLIC_` variable or Git. Native store provisioning
may return credentials; save them directly as scoped Vercel Secrets without
printing or persisting them locally.

---

## 9. Cron Jobs

The deployment configuration supports the current Hobby plan's daily scheduling limit:

| Endpoint | Schedule (UTC) |
| --- | --- |
| `/api/cron/booking-reminders` | Daily, 09:00 hour |
| `/api/cron/quiz-followup` | Daily, 06:00 hour |
| `/api/cron/abandoned-cart` | Daily, 12:00 hour |
| `/api/cron/aggregate-funnel` | Daily, 00:00 hour |
| `/api/cron/cleanup-events` | Sunday, 03:00 hour |

Hobby execution can occur anywhere within the scheduled hour. Quiz/cart age thresholds determine eligibility; messages are sent at a later batch run, so they are not guaranteed at the one-hour or 24-hour threshold. Each endpoint currently processes at most 50 eligible records per run; monitor backlog and provider failures. A scheduler supporting more frequent invocation is needed before promising hourly delivery. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

All endpoints require `CRON_SECRET`; Vercel sends it as a Bearer authorization header. Preview deployments do not execute Vercel's production cron jobs. Keep Preview notification/email providers separate from live customer delivery.

---

## 10. Post-Deployment Checklist

- [ ] Verify database migrations are applied (`prisma migrate deploy`)
- [ ] Seed initial data if needed (`pnpm seed`)
- [ ] Create an admin user (`pnpm tsx scripts/create-admin.ts admin@example.com`)
- [ ] Test the health endpoint: `GET /api/health`
- [ ] Configure Razorpay webhooks pointing to production URL
- [ ] Verify payment flow end-to-end with Razorpay test mode
- [ ] Set `NEXT_PUBLIC_ROBOTS="production"` to allow search engine indexing
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your production domain
- [ ] Enable Sentry alerts for error monitoring
- [ ] Review security headers in browser DevTools

---

## Custom Server (Socket.IO)

For real-time notifications via Socket.IO, use the custom server instead of the default Next.js server:

```bash
pnpm start:custom
```

This runs `server.ts` which integrates Socket.IO with the Next.js HTTP server. On Vercel, Socket.IO falls back to polling automatically.

---

## Rollback

Vercel supports instant rollback to any previous deployment from the dashboard. For database rollbacks, keep migration SQL files and test reversal scripts in development before applying to production.
