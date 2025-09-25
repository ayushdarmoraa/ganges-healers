"use client"

import { useSession } from "next-auth/react"
import { ReactNode } from "react"

interface ProtectedProps {
  children: ReactNode
  fallback?: ReactNode
  requireRole?: string
}

/**
 * Client component to protect content
 * Shows children only if user is authenticated
 */
export function Protected({ children, fallback = null, requireRole }: ProtectedProps) {
  const { data: session, status } = useSession()
  
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }
  
  if (!session?.user) {
    return <>{fallback}</>
  }
  
  if (requireRole && session.user.role !== requireRole) {
    return (
      <div className="text-center p-8">
        <p className="text-muted-foreground">You don&apos;t have permission to access this content.</p>
      </div>
    )
  }
  
  return <>{children}</>
}