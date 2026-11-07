# NextAuth Implementation - Testing Guide

## Account closure

Settings provides a private review and explicit closure confirmation. The last
normal sign-in must be within five minutes; refreshes cannot extend that window.
Use the existing sign-in flow and MFA where enabled. Staff/practitioner accounts
must transfer responsibilities through an administrator; outstanding commitments
must be resolved first. Closing disables sign-in, revokes existing sessions and
recovery, and retains purchase/billing records and identity reservations. It is
not data erasure. See `docs/contracts.md` for API, race and repair behavior.

Do not restore authentication code that ignores `closedAt` after closures exist.
Disable the closure writer for repair while retaining closed-account guards.

## 🎯 Features Implemented

✅ **Complete NextAuth Setup**
- PrismaAdapter with PostgreSQL  
- Credentials provider (email/password with bcryptjs)
- Google OAuth provider (configurable)
- JWT strategy with extended session data

✅ **Registration System**
- `/register` page with shadcn/ui forms + zod validation
- Password hashing with bcryptjs
- Automatic role assignment (USER)
- Free session credits for new users

✅ **Enhanced Session Data**
- User ID, role, VIP status, freeSessionCredits in session
- TypeScript types properly extended

✅ **Protected Routes**
- `withAuth()` server helper (redirects if unauthenticated)
- `Protected` client component for conditional rendering
- Dashboard page demonstrates protection

✅ **Updated UI**
- Navbar shows Register/Sign In buttons when logged out
- Register/Sign In pages with proper form validation
- Dashboard shows user role, VIP status, session credits

## 🧪 Manual Testing Checklist

### Test-only login helper

Production authentication requires a configured `AUTH_SECRET` or `NEXTAUTH_SECRET`.
The fixed demo fallback provider has been removed; credentials login always checks
the user's stored password hash. No accounts are created as a login fallback.
Production/preview startup rejects either test flag set to `1`. Server shortcuts
accept only the private `TEST_MODE` flag in a development or test runtime; the
public flag never grants server authorization or bypasses payment signatures.

`GET /api/test/login` is available only when `TEST_MODE=1` and `NODE_ENV` is
`development` or `test`. It returns `404` in production (including preview
production builds), even if a test flag is accidentally enabled, and also rejects
missing or unrecognized runtime environments. `NEXT_PUBLIC_TEST_MODE` alone does
not enable it. Rejected requests do not access user records or issue session cookies.

Use the existing `pnpm dev:test` launcher for local E2E login. Production and
preview must use normal authentication; this helper cannot log into a production
server. Database safety for the E2E launcher must be checked separately before use.

### Session revocation

Every authenticated session read refreshes the current database role, membership
access and credit balance in one user lookup. Removing an administrator or healer
role takes effect on the next authenticated request. A deleted account or a token
without a valid account ID is rejected. Client session updates cannot set roles or
entitlements, and a failed lookup does not fall back to cached privileges.

### 1. Registration Flow
- [ ] Visit http://localhost:3000
- [ ] Click "Register" button in navbar  
- [ ] Fill out registration form with valid data
- [ ] Submit form → should redirect to sign-in page
- [ ] Check database: new user should be created with hashed password

### 2. Sign In Flow  
- [ ] Use credentials from registration OR admin account
- [ ] For admin checks, use an administrator account provisioned for the isolated test environment.
- [ ] Sign in → should redirect to dashboard
- [ ] Navbar should show user avatar and Sign Out button

### 3. Protected Routes
- [ ] While signed in, visit `/dashboard` → should show content
- [ ] Sign out from navbar  
- [ ] Try to visit `/dashboard` → should redirect to sign-in page

### 4. Session Data
- [ ] On dashboard, verify display shows:
  - User name
  - Role (USER/ADMIN/HEALER)  
  - VIP status (✨ if VIP member)
  - Free session credits count

### 5. Google OAuth (Optional)
- [ ] Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
- [ ] Visit sign-in page → should show Google option
- [ ] Test Google sign-in flow

## 🔧 Environment Variables Required

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="your-secret-here"  
NEXTAUTH_URL="http://localhost:3000"

# Optional - Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## 📁 Files Created/Modified

**New Files:**
- `src/app/register/page.tsx` - Registration page
- `src/app/api/auth/register/route.ts` - Registration API endpoint  
- `src/components/auth/register-form.tsx` - Registration form component
- `src/components/protected.tsx` - Protected client component
- `src/lib/auth-helpers.ts` - Server-side auth helpers

**Modified Files:**
- `src/lib/auth.ts` - Added PrismaAdapter, Google provider, bcrypt, extended session
- `src/types/auth.ts` - Extended session interface for VIP, credits
- `src/components/navbar.tsx` - Added Register button  
- `src/app/auth/signin/page.tsx` - Added link to register
- `src/app/dashboard/page.tsx` - Uses withAuth, shows user data
- `prisma/schema.prisma` - Added password field to User model
- `prisma/seed.ts` - Added password hashing for seeded users

## 🚀 Next Steps

1. **Test the complete flow** using the checklist above
2. **Add Google OAuth credentials** if needed
3. **Customize user roles** and permissions as needed
4. **Add email verification** for enhanced security
5. **Verify password recovery email delivery** using the implemented flow below
6. **Add rate limiting** for auth endpoints

## 🐛 Troubleshooting

- **Build errors**: Check that all imports are correct and Prisma client is generated
- **Auth not working**: Verify `AUTH_SECRET` is set in `.env`
- **Database issues**: Run `npm run prisma:migrate` and `npm run seed`
- **Google OAuth issues**: Verify client ID/secret and redirect URIs in Google Console
# Password recovery

Recovery issuance requires a unique case-insensitive account match. Reset links
bind both the current stored credential version and a digest of the normalized
account email; changing either makes an earlier link invalid. The update checks
both values again atomically, including an email change racing confirmation.
Old links from the earlier preview implementation require a fresh request.

Failed token persistence or email delivery removes only that attempt's link and
its exact throttle reservation. A delayed failure cannot clear a newer request's
reservation. The customer may retry immediately after failed delivery rather than
waiting through an unused cooldown. Recovery forms require the documented success
envelope before claiming delivery or a changed password, and retain drafts on
malformed replies. Confirmed settings password changes explicitly sign the current
browser out. Both settings and recovery reject passwords exceeding bcrypt's
72-byte UTF-8 capacity.

The sign-in screen links to `/auth/reset-password` and preserves a safe local
booking callback. Recovery uses the existing Resend service and
`VerificationToken` table; it requires `RESEND_API_KEY`, a verified sender for
`noreply@gangeshealers.com`, and a trusted application origin (`AUTH_URL`,
`NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, or automatic `VERCEL_URL`). Missing
configuration is shown as temporarily unavailable; email delivery has not been
verified in the new Ganges workspace.

Phone ownership verification uses `GET/POST /api/users/me/phone-verification`
and settings controls. The additive `20261106142000_phone_verification` migration
adds nullable proof fields and one current challenge/rate record per account.
Only provider-approved, current-owner/current-phone/current-credential checks
set verification; resend/guess limits and a durable check lease are shared across
instances. Phone edits clear proof; passwords, MFA and login rules are unchanged.

The fixed-origin Twilio Verify adapter uses `TWILIO_VERIFY_SERVICE_SID` and
`TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`, or the existing planned
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` pair when API keys are absent. Never
commit credentials. Missing configuration reports unavailable. Numbers require
an explicit +country code; existing local numbers are not guessed or rewritten.
No dependency is added. Real SMS activation/delivery is a separate acceptance
step; automated browser servers suppress SMS credentials, while unit/database
tests use explicit provider fixtures rather than a public verification bypass.

Profile settings use an owner-bound saved-name/phone version for conditional
saves. Stale tabs and changed owners receive conflicts; failed operations retain
the draft until an explicit discard/reload. The API handles phone uniqueness
races without partial writes or raw personal data in logs. The new response
version and conditional headers are documented in `docs/contracts.md`; legacy
JSON callers remain compatible. This changes no credentials or billing records
and requires no provider configuration, schema migration or dependency.

Email ownership verification now uses the same configured mail service and
trusted-origin validation, with account status/resend controls in settings and
`/auth/verify-email` for confirmation. Links are hashed at rest, last 30 minutes,
are consumed only by an explicit confirmation POST, and bind the current email
and security version. Loading a link cannot verify an address. This sets only
the existing `emailVerified` field; it never issues a session, changes login
requirements or bypasses an enabled authenticator. Missing delivery configuration
returns an unavailable message. Actual provider delivery remains unverified;
isolated tests exercise the real confirmation path using synthetic email links.

Links expire after 15 minutes, are single-use, and invalidate other recovery
links and prior sessions. Accounts with Google only continue using Google.
The rollout requires existing users to sign in once because old JWT cookies do
not contain a credential version. Browser/API sessions revalidate on their next
read; custom-server notification sockets revalidate within 30 seconds. Existing
password-change responses remain compatible and cannot overwrite a concurrently
changed credential. See `docs/contracts.md` for endpoint and error contracts.
