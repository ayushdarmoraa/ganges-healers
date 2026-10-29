// src/lib/auth.ts
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

import { assertProductionTestModeDisabled } from '@/lib/test-mode'

assertProductionTestModeDisabled()
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (process.env.NODE_ENV === 'production' && !authSecret) {
  throw new Error('AUTH_SECRET or NEXTAUTH_SECRET is required for production authentication.')
}

const providers = []

// Primary credentials provider (DB-backed) – keep for real users
providers.push(
  CredentialsProvider({
    id: 'credentials',
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' }
    },
      async authorize(credentials) {
      const email = typeof credentials?.email === 'string' ? credentials.email : undefined
      const password = typeof credentials?.password === 'string' ? credentials.password : undefined
      if (!email || !password) return null
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !user.password) return null
      const passwordsMatch = await bcrypt.compare(password, user.password)
      if (!passwordsMatch) return null
      return {
        id: user.id,
        email: user.email!,
        name: user.name,
        role: user.role,
        vip: user.vip,
        freeSessionCredits: user.freeSessionCredits,
      }
    }
  })
)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Require a configured secret; never substitute a public fallback.
  secret: authSecret,
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin', error: '/auth/error' },
  trustHost: true,
  providers,
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as { id: string; role?: string; vip?: boolean; freeSessionCredits?: number }
        token.id = u.id
        if (u.role) token.role = u.role
        if (typeof u.vip !== 'undefined') token.vip = u.vip
        if (typeof u.freeSessionCredits !== 'undefined') token.freeSessionCredits = u.freeSessionCredits
      }
      // When the client calls update(), re-fetch name & image from DB
      if (trigger === 'update' && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, image: true },
        })
        if (fresh) {
          token.name = fresh.name
          token.picture = fresh.image
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        interface UserSessionShape { id?: string; role?: string; vip?: boolean; freeSessionCredits?: number; email?: string | null; name?: string | null }
        const su = session.user as UserSessionShape
        su.id = token.id as string
        if (token.role) su.role = token.role as string
        if (typeof token.vip !== 'undefined') su.vip = token.vip as boolean
        if (typeof token.freeSessionCredits !== 'undefined') su.freeSessionCredits = token.freeSessionCredits as number
      }
      return session
    }
  }
})