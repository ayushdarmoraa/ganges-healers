// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth"
import type { RecentAuthentication } from '@/lib/auth/password-version'

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      vip: boolean
      freeSessionCredits: number
      recentAuthentication?: RecentAuthentication
    } & DefaultSession["user"]
  }

  interface User {
    role: string
    vip: boolean
    freeSessionCredits: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    passwordVersion?: string
    recentAuthentication?: RecentAuthentication
    role: string
    vip: boolean
    freeSessionCredits: number
  }
}
