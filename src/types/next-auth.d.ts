// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      vip: boolean
      freeSessionCredits: number
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
    role: string
    vip: boolean
    freeSessionCredits: number
  }
}