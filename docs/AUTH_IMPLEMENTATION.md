# NextAuth Implementation - Testing Guide

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

### 1. Registration Flow
- [ ] Visit http://localhost:3000
- [ ] Click "Register" button in navbar  
- [ ] Fill out registration form with valid data
- [ ] Submit form → should redirect to sign-in page
- [ ] Check database: new user should be created with hashed password

### 2. Sign In Flow  
- [ ] Use credentials from registration OR admin account
- [ ] Admin: `admin@ganges-healers.com` / `admin123`
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
5. **Implement password reset** functionality
6. **Add rate limiting** for auth endpoints

## 🐛 Troubleshooting

- **Build errors**: Check that all imports are correct and Prisma client is generated
- **Auth not working**: Verify `AUTH_SECRET` is set in `.env`
- **Database issues**: Run `npm run prisma:migrate` and `npm run seed`
- **Google OAuth issues**: Verify client ID/secret and redirect URIs in Google Console