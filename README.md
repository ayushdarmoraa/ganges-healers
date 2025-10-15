# Ganges Healers - Healthcare Management System

A modern healthcare management system built with Next.js 14, TypeScript, and a comprehensive tech stack for managing medical services, appointments, and patient records.

> Project roadmap: See docs/IMPLEMENTATION_PLAN.md for the 24-week implementation plan and sprint breakdown.
> Engineering process: See docs/GUARDRAILS.md for change management and contribution rules.
> Authentication: See docs/AUTH_IMPLEMENTATION.md for NextAuth setup and testing guide.
> Analytics: See docs/analytics.md for the client-only analytics shim and events.
> SEO: See docs/seo.md for canonical URLs, Breadcrumbs & JSON-LD components.
> Sitemap: Generated via app/sitemap.ts using a helper that outputs canonical URLs only; see docs/seo.md.
> Robots: Served via app/robots.ts; see docs/seo.md.

## Tech Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js with Google OAuth & Credentials
- **Form Management:** React Hook Form with Zod validation
- **Date Utilities:** date-fns
- **HTTP Client:** Axios
- **Toast Notifications:** Sonner

## Features

- 🔐 **Authentication System**
  - Google OAuth integration
  - Credentials-based login
  - Role-based access control (USER/ADMIN)
  - Session management
  - Appointment booking system
  - Patient dashboard
  - Medical records management

- 🎨 **Modern UI/UX**
  - Responsive design with Tailwind CSS
  - Accessible UI components from shadcn/ui
  - Dark/light mode support
  - Toast notifications

- 📊 **Dashboard Features**
  - Patient overview
  - Appointment management
  - Medical records access
  - Profile management

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Google OAuth credentials (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ganges-healers
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/ganges_healers"
   AUTH_SECRET="your-auth-secret-here"
   NEXTAUTH_URL="http://localhost:3000"
   
   # Google OAuth (optional)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   
   # Razorpay (for payments - optional)
   RAZORPAY_KEY_ID="your-razorpay-key-id"
   RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
   
   # Redis (optional)
   REDIS_URL="redis://localhost:6379"
   ```

4. **Set up the database**
   ```bash
   # Run database migrations
   npm run prisma:migrate
   
   # Generate Prisma client
   npx prisma generate
   
   # Seed the database with initial data
   npm run seed
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run seed` - Seed the database with initial data

## Database Schema

The application uses the following main models:

- **User** - User accounts with authentication
- **Account** - OAuth account linking
- **Session** - User sessions
- **VerificationToken** - Email verification tokens

### Default Admin Account

After running the seed script, you can log in with:
- **Email:** admin@ganges-healers.com
- **Password:** admin123

## Project Structure

```
ganges-healers/
├── src/
│   ├── app/                    # App Router pages
│   │   ├── api/               # API routes
│   │   ├── auth/              # Authentication pages
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── services/          # Services pages
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Homepage
│   ├── components/            # Reusable components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── navbar.tsx        # Navigation component
│   │   └── providers.tsx     # Context providers
│   ├── lib/                  # Utility libraries
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── prisma.ts        # Prisma client
│   │   └── utils.ts         # Utility functions
│   └── types/               # TypeScript type definitions
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts             # Database seeding script
├── public/                 # Static assets
└── package.json           # Dependencies and scripts
```

## Authentication

The app supports two authentication methods:

1. **Google OAuth** - Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
2. **Credentials** - Email/password authentication with bcrypt hashing

## Deployment

### Environment Setup

1. Set up a PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Build and deploy the application

### Database Migration

```bash
# Run migrations in production
npm run prisma:migrate

# Generate Prisma client
npx prisma generate
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team

---

Built with ❤️ using Next.js 14 and modern web technologies.

## Accessibility

We ship with sensible, test-backed accessibility defaults:

- Landmarks: a visible-on-focus Skip to main link and a main region with id="main-content" for quick keyboard navigation.
- Breadcrumbs: rendered inside nav aria-label="Breadcrumb" with aria-current="page" on the last item; separators are aria-hidden.
- Empty states: announced via role="status" and aria-live="polite" with a proper heading for context.
- Modal dialogs: explicit role="dialog" and aria-modal="true", titled via aria-labelledby pointing to DialogTitle; focus is trapped, first control is focused on open, and ESC/close restores prior focus.
- Focus visibility: a reusable focus-ring utility class applied to primary links and buttons for strong, consistent outlines.
- CTA semantics: anchors for navigation, buttons for actions (with type="button" where appropriate), no onClick on non-interactive elements, and labels for icon-only buttons.

These behaviors are covered by unit/UI tests (including jest-axe checks) to prevent regressions.

## Admin Payments Dashboard

The admin analytics dashboard (`/admin/payments`) provides revenue and refund insights across key payment domains.

### Metrics (All values in paise unless formatted in UI)

- Gross: Sum of successful payment amounts in range (`Payment.statusEnum = SUCCESS`).
- Refunds: Sum of refund amounts (`Refund.amountPaise`) whose `createdAt` is within range (refunds do not reduce Gross; they affect Net only).
- Net: Gross − Refunds.
- Payments Count: Number of successful payments in range.
- Refunds Count: Number of refunds in range.
- AOV: Gross / Payments Count (0 if count is 0).
- MRR (Normalized): For each active VIP membership: add full monthly plan price; add yearly plan price / 12 (rounded). Computed from `VIPMembership.status=active` joined to `MembershipPlan.interval`.

### Breakdown & Top Programs

- byType: Stable keys: `SESSION`, `PROGRAM`, `MEMBERSHIP`, `STORE`, `COURSE` (0-filled if absent).
- topPrograms: Up to 5 highest grossing PROGRAM payments (metadata.programId) with fields `{ programId, title, grossPaise }`.

### Endpoints (Admin Guarded)

All endpoints require the caller to be an ADMIN; non-admin receives 403 `{ error: "Forbidden: admin only" }`.

1. `GET /api/admin/payments/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&type=ALL|SESSION|PROGRAM|MEMBERSHIP|STORE|COURSE`
   Response:
   ```json
   {
     "range": {"from":"2025-08-29","to":"2025-09-27"},
     "kpi": {"grossPaise":0,"refundsPaise":0,"netPaise":0,"paymentsCount":0,"refundsCount":0,"aovPaise":0,"mrrPaise":0},
     "byType": {"SESSION":0,"PROGRAM":0,"MEMBERSHIP":0,"STORE":0,"COURSE":0},
     "topPrograms": [ {"programId":"...","title":"...","grossPaise":0} ]
   }
   ```
2. `GET /api/admin/payments/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD&type=...` (interval fixed to daily for MVP)
   Returns array of contiguous days: `[{"date":"YYYY-MM-DD","grossPaise":0,"refundsPaise":0,"netPaise":0,"byType":{"SESSION":0,"PROGRAM":0,"MEMBERSHIP":0,"STORE":0,"COURSE":0}}]` (zero-filled).
3. `GET /api/admin/payments/latest?limit=20&type=...` Returns recent successful payments with `{ id, createdAt, amountPaise, type, source, userId }`.
4. `GET /api/admin/payments/refunds?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20` Returns recent refunds `{ id, paymentId, amountPaise, createdAt }`.

### Filters & Range Behavior

- Default range: last 30 days (inclusive) when no params supplied.
- Range boundaries use ISO date (UTC) day slices.
- Type filter defaults to `ALL`. When specified, metrics/timeseries/latest restrict to that `Payment.type`. Refunds endpoint is unaffected by `type` (refunds not strongly typed by original payment type in response).

### UI Features

- KPI cards (Gross, Refunds, Net, Payments, Refunds Count, AOV, MRR) with INR formatting.
- Net Revenue Line Chart (daily netPaise).
- Stacked Gross by Type Bar Chart (SESSION/PROGRAM/MEMBERSHIP/STORE/COURSE).
- Recent Payments & Refunds tables (sortable by date/amount) with source pill (Program / Booking / Membership) and partial IDs.
- Skeleton loading states, empty states, toast errors on fetch (`[admin][payments][ui_error]`).

### Logging & Observability

Server endpoints log: `[admin][payments][metrics|timeseries|latest|refunds] { from,to,type,limit?,ms }` and `[slow]` variant if `ms > 400`.
Client fetch wrapper logs `[admin][payments][ui_fetch]` and errors log `[admin][payments][ui_error]` without PII.

### Log Samples (Non-PII)

```
[admin][payments][metrics][slow] { from: '2025-08-29', to: '2025-09-27', type: 'ALL', ms: 8042 }
[admin][payments][timeseries][slow] { from: '2025-08-29', to: '2025-09-27', type: 'SESSION', ms: 1364 }
[admin][payments][latest][slow] { limit: 20, type: 'ALL', ms: 6620 }
[admin][payments][refunds][slow] { from: '2025-08-29', to: '2025-09-27', limit: 20, ms: 4219 }
[invoice][generate][created] { paymentId: 'cmg26ir2e000xuk90t0wbv20i', invoiceNumber: 'INV-20250927-4BBE7D', pdf: false }
[invoice][generate][upload_skipped_no_token] { paymentId: 'cmg26ir2e000xuk90t0wbv20i' }
[auth][admin][bypass_test_mode]   # (CI / e2e ONLY; never present in Preview/Production)
```

These examples illustrate typical performance and lifecycle logging. Any `[slow]` tag highlights handlers exceeding the 400ms threshold. The bypass line only appears when `TEST_MODE=1` (restricted to local/CI).

### TEST_MODE (CI / E2E Only)

`TEST_MODE=1` activates an automated admin bypass used solely in Playwright / CI environments to avoid full auth flows. When enabled the server logs a structured line `[auth][admin][bypass_test_mode]` on each admin guard invocation. This MUST NEVER be set in production or preview environments. Deployment pipelines should explicitly unset `TEST_MODE`.

### Assumptions / Data Sources

- Success is determined via `Payment.statusEnum = SUCCESS` (ignore legacy `Payment.status`).
- Refunds reduce Net only; Gross remains a pure measure of captured revenue.
- MRR does not prorate partial months; yearly plans normalized by simple division by 12.
- All monetary values are persisted in paise (integer) and formatted to INR client-side.

### Seed Data (Dev Convenience)

Seed script includes core users/healers/services. For richer analytics, extend with sample Payments / Refunds (see `prisma/seed.ts`). Add monthly & yearly active memberships for non-zero MRR.

### Future Enhancements

- Weekly/monthly aggregation modes.
- Export (CSV) of payments/refunds.
- Program revenue attribution by enrollment date.
- Performance indexes (compound on `(statusEnum, createdAt)` if needed at scale).

## VIP Memberships (Razorpay Subscriptions)

The platform supports a VIP membership via Razorpay Subscriptions providing recurring benefits.

### Plans & Mapping

Create plans in Razorpay (Test Mode):
- Monthly (199.00 INR) -> store returned `plan_id` in `MembershipPlan.razorpayPlanId`
- Yearly (1,990.00 INR) -> store returned `plan_id`

Insert (or update) rows in `MembershipPlan` with:
```
slug: monthly-vip | yearly-vip
title: "Monthly VIP" | "Yearly VIP"
pricePaise: 19900 | 199000
interval: MONTHLY | YEARLY
razorpayPlanId: <dashboard plan_id>
benefits JSON example: { "freeSessions": 2, "priorityBooking": true, "discountPct": 10 }
```

### Endpoints

POST /api/memberships/subscribe
Body: { planSlug }
Response: { subscriptionId, membershipId }
Guards: blocks if user already has pending/active membership (409).

GET /api/memberships/plans
Response: { plans: [ { slug, title, pricePaise, interval, benefits } ] }

GET /api/memberships/me
Response: {
   membership: { id, status, startDate?, nextBillingAt?, endDate?, plan: { title, pricePaise, interval } } | null,
   credits: { total }
}

### Webhook Events (Razorpay → /api/payments/webhook)

Required events:
- subscription.activated → membership active + benefits grant (idempotent)
- subscription.paused → status=paused
- subscription.halted → status=halted
- subscription.cancelled → status=cancelled, cancelledAt set
- (Existing) payment.captured / payment.failed / refund.processed remain supported for other domains.

Signature validation uses `RAZORPAY_WEBHOOK_SECRET` with HMAC SHA256 over raw body. HMAC mismatch logs a warn including the event type.

### Benefits Provisioning Policy (MVP)

- Free session credits granted once on first activation for the membership (no per-billing-cycle accumulation yet).
- No expiry (credits do not currently expire).
- Re-activation within the same billing cycle does NOT grant extra credits.
- User `vip` flag set to true upon first activation.

### UI Flow (/dashboard/membership)

1. User visits membership page.
2. If no active/pending membership: fetch plans, display cards, user selects Subscribe.
3. App calls `POST /api/memberships/subscribe`, obtains subscriptionId, triggers Razorpay Checkout (subscription mode).
4. Page shows pending state and polls `GET /api/memberships/me` every ~4s up to 60s.
5. On `subscription.activated` webhook, polling detects status=active → shows success + credits.

### Local Test Steps

1. Ensure env vars set: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID.
2. Create test plans in Razorpay and update MembershipPlan rows (or seed them).
3. Start dev server.
4. Subscribe via UI; in Razorpay dashboard (or mock), trigger / resend activation webhook.
5. Verify `/api/memberships/me` returns active status & credits.

### Observability

Structured logs emitted:
```
[membership][subscribe][created]
[membership][subscribe][blocked_duplicate]
[membership][activated]
[membership][benefits_granted]
[membership][benefits_skipped]
[membership][paused]
[membership][halted]
[membership][cancelled]
[membership][idempotent]
```

### Future Enhancements (Post-MVP)
- Per-cycle credit accrual & expiry.
- Proration and mid-cycle upgrades.
- Email notifications on state changes.
- Membership downgrades / plan switching.


## Production Environment Variables (Quick Reference)

The application loads most configuration from process.env. Missing Razorpay keys no longer crash the build; the order route returns a 500 with a descriptive error.

```
# Core
NEXTAUTH_URL=https://your-domain.example
AUTH_SECRET=<64-hex-random>
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

## Developer Docs

- Ops Checklist: see `docs/ops-checklist.md`
- Payments and memberships contracts: see `docs/payments.md`
- Invoices contracts and generator behavior: see `docs/invoices.md`

Local webhook simulator (uses raw HMAC with your local secret):

```
pnpm simulate:webhook
```

# Payments (optional but required for Razorpay flow)
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=<random>

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Redis (optional caching layer)
REDIS_URL=rediss://...
```

If Razorpay variables are absent:
- Booking creation still works for VIP / credits flows.
- Generic payment creation endpoint returns `{ error: "Payment gateway unavailable" }` (HTTP 500) without affecting other routes.

### Generic Payments Flow

New unified endpoints:

POST /api/payments/create-order
- Booking: provide bookingId
- Generic: provide type + amountPaise
- Exclusive: must supply exactly one of bookingId or type
- Returns: orderId, amountPaise, currency, key, paymentId

POST /api/payments/verify
- Body: { orderId, paymentId: gatewayPaymentId, signature }
- Idempotent success returns idempotent=true on repeat

POST /api/payments/webhook
- Validates x-razorpay-signature over raw body
- Handles payment.captured, payment.failed, refund.processed
- Full refund => statusEnum REFUNDED

Client helper: `openRazorpayCheckout` in `src/lib/payments/openRazorpayCheckout.ts`.

Legacy route `/api/payments/razorpay/order` has been removed (previously gated by ENABLE_LEGACY_RAZORPAY_ORDER). Use `/api/payments/create-order` instead.

Add indexes (optional hardening): see future migration suggestion for booking status + service indexing and partial unique index on Payment.paymentId where status='success' for idempotency.

<!-- Invoices & Billing section appended -->
## Invoices & Billing

Automated invoices are generated for each successful non-zero payment and surfaced via `/dashboard`, `/dashboard/membership`, and `/dashboard/billing`.

Key endpoints: `POST /api/invoices/generate`, `GET /api/invoices/[paymentId]`, `GET /api/invoices/me`.

Generation triggers: payment verify + `payment.captured` webhook (idempotent), or manual generate.

Env: `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `RESEND_API_KEY` (emails). Missing blob token logs `[upload_skipped_no_token]` and leaves `pdfUrl` empty until regenerated.

Structured logs use prefix `[invoice][generate]` with final `[created]` tag on success.

Admin backfill: `POST /api/admin/invoices/backfill` `{ chunkSize?, dryRun? }` to create invoices for historical successful payments lacking one.

Test locally: complete a test payment, view `/dashboard/billing`, call generate endpoint twice → second shows idempotent; replay webhook for idempotency validation.
