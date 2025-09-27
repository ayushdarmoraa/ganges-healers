// src/lib/auth.ts
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

export const { 
  handlers, 
  auth, 
  signIn, 
  signOut 
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Provide stable secret for tests/dev if not supplied
  secret: process.env.NEXTAUTH_SECRET || 'dev_fallback_secret',
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  trustHost: true, // Important for Vercel deployment
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string
          }
        })

        if (!user || !user.password) {
          return null
        }

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!passwordsMatch) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vip: user.vip,
          freeSessionCredits: user.freeSessionCredits,
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = user.role
        token.vip = user.vip
        token.freeSessionCredits = user.freeSessionCredits
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.vip = token.vip as boolean
        session.user.freeSessionCredits = token.freeSessionCredits as number
      }
      return session
    }
  }
})