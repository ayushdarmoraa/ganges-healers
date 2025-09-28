// src/lib/auth.ts
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

// Build providers array dynamically so we can add a fallback in prod when no OAuth configured.
import type { Provider } from 'next-auth/providers'
const providers: Provider[] = []

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

// Fallback dev/prod emergency credentials provider if no GOOGLE_CLIENT_ID configured.
if (!process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    CredentialsProvider({
      id: 'fallback',
      name: 'Credentials (Fallback)',
      credentials: {
        email: { label: 'Email', type: 'email', value: 'test@example.com' },
        password: { label: 'Password', type: 'password', value: 'demo123' }
      },
      async authorize(credentials) {
        const rawEmail = credentials?.email
        const rawPassword = credentials?.password
        const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase() : undefined
        const password = typeof rawPassword === 'string' ? rawPassword : undefined
        if (email !== 'test@example.com' || password !== 'demo123') return null

        // Ensure a user exists (idempotent)
        let user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          // Hash the demo password for consistency (though we don't re-use it here)
            const hash = await bcrypt.hash('demo123', 10)
          user = await prisma.user.create({
            data: {
              email,
              name: 'Test User',
              password: hash,
              role: 'USER'
            }
          })
        }
        return { id: user.id, email: user.email!, name: user.name ?? 'Test User', role: user.role, vip: user.vip, freeSessionCredits: user.freeSessionCredits }
      }
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET || 'dev_fallback_secret',
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin', error: '/auth/error' },
  trustHost: true,
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role?: string; vip?: boolean; freeSessionCredits?: number }
        token.id = u.id
        if (u.role) token.role = u.role
        if (typeof u.vip !== 'undefined') token.vip = u.vip
        if (typeof u.freeSessionCredits !== 'undefined') token.freeSessionCredits = u.freeSessionCredits
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