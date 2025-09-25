import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

/**
 * Server-side helper to protect routes
 * Redirects to sign-in if unauthenticated
 */
export async function withAuth() {
  const session = await auth()
  
  if (!session?.user) {
    redirect("/auth/signin")
  }
  
  return session
}

/**
 * Get session on server side (no redirect)
 */
export async function getSession() {
  return await auth()
}