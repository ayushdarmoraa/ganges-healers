// src/lib/auth.ts
import NextAuth, { type NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import bcrypt from "bcryptjs"

import { membershipAccess } from '@/lib/memberships/access'
import { assertProductionTestModeDisabled } from '@/lib/test-mode'
import { createRecentAuthentication, sessionCredentialVersion } from '@/lib/auth/password-version'
import { verifyTwoFactorLogin } from '@/lib/auth/two-factor'

assertProductionTestModeDisabled()
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (process.env.NODE_ENV === 'production' && !authSecret) {
  throw new Error('AUTH_SECRET or NEXTAUTH_SECRET is required for production authentication.')
}

const providers: NextAuthConfig['providers'] = []

// Primary credentials provider (DB-backed) – keep for real users
providers.push(
  CredentialsProvider({
    id: 'credentials',
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
      twoFactorCode: { label: 'Authenticator or recovery code', type: 'text' }
    },
      async authorize(credentials) {
      const email = typeof credentials?.email === 'string' ? credentials.email : undefined
      const password = typeof credentials?.password === 'string' ? credentials.password : undefined
      if (!email || !password) return null
      const user = await prisma.user.findUnique({ where: { email }, include: { twoFactorCredential: { select: { enabled: true } } } })
      if (!user || user.closedAt || !user.password) return null
      const passwordsMatch = await bcrypt.compare(password, user.password)
      if (!passwordsMatch) return null
      if (user.twoFactorCredential?.enabled) {
        const code = typeof credentials?.twoFactorCode === 'string' ? credentials.twoFactorCode.trim() : ''
        if (!code || code.length > 128) return null
        try { if (!await verifyTwoFactorLogin({ userId: user.id, passwordHash: user.password, securityVersion: user.securityVersion, code })) return null } catch { return null }
      }
      return {
        id: user.id,
        email: user.email!,
        name: user.name,
        role: user.role,
        vip: user.vip,
        freeSessionCredits: user.freeSessionCredits,
        passwordVersion: sessionCredentialVersion(user.password, user.securityVersion),
      }
    }
  })
)

const googleClientId = (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID)?.trim()
const googleClientSecret = (process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET)?.trim()
if (googleClientId && googleClientSecret) {
  providers.push(GoogleProvider({ clientId: googleClientId, clientSecret: googleClientSecret }))
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Require a configured secret; never substitute a public fallback.
  secret: authSecret,
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin', error: '/auth/error' },
  trustHost: true,
  providers,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account || account.provider === 'credentials') return true
      if (account.provider === 'google' && profile?.email_verified !== true || !user?.id) return false
      const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { closedAt: true, twoFactorCredential: { select: { enabled: true } } } })
      // A linked OAuth provider must not bypass the locally enabled factor.
      return !existing?.closedAt && !existing?.twoFactorCredential?.enabled
    },
    async jwt({ token, user, trigger, account }) {
      if (user) {
        const u = user as { id: string; role?: string; vip?: boolean; freeSessionCredits?: number }
        token.id = u.id
        if (u.role) token.role = u.role
        if (typeof u.vip !== 'undefined') token.vip = u.vip
        if (typeof u.freeSessionCredits !== 'undefined') token.freeSessionCredits = u.freeSessionCredits
      }
      // Revalidate identity and privileges on every session read using the existing lookup.
      // Client updates may refresh profile fields but cannot supply authorization claims.
      if (typeof token.id !== 'string' || !token.id) return null
      const fresh = await prisma.user.findUnique({
        where: { id: token.id },
        select: { name: true, image: true, password: true, securityVersion: true, closedAt: true, role: true, vip: true, freeSessionCredits: true, memberships: { select: { status: true, endDate: true } }, twoFactorCredential: { select: { enabled: true } } },
      })
      if (!fresh || fresh.closedAt) return null
      const version = sessionCredentialVersion(fresh.password, fresh.securityVersion)
      if (user) {
        // A reset between password verification and token issuance must not issue a surviving session.
        const verifiedVersion = (user as { passwordVersion?: string }).passwordVersion
        if (fresh.twoFactorCredential?.enabled && (account?.provider !== 'credentials' || verifiedVersion !== version)) return null
        if (verifiedVersion !== undefined && verifiedVersion !== version) return null
        token.passwordVersion = version
        token.recentAuthentication = createRecentAuthentication(token.id, version)
      }
      else if (token.passwordVersion !== version) return null
      if (trigger === 'update') {
        token.name = fresh.name
        token.picture = fresh.image
      }
      token.role = fresh.role
      token.vip = membershipAccess(fresh.vip, fresh.memberships)
      token.freeSessionCredits = fresh.freeSessionCredits
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        interface UserSessionShape { id?: string; role?: string; vip?: boolean; freeSessionCredits?: number; email?: string | null; name?: string | null; recentAuthentication?: typeof token.recentAuthentication }
        const su = session.user as UserSessionShape
        su.id = token.id as string
        su.recentAuthentication = token.recentAuthentication
        if (token.role) su.role = token.role as string
        if (typeof token.vip !== 'undefined') su.vip = token.vip as boolean
        if (typeof token.freeSessionCredits !== 'undefined') su.freeSessionCredits = token.freeSessionCredits as number
      }
      return session
    }
  }
})
