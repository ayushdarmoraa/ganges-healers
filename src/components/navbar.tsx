"use client"

import Link from "next/link"
import { useSession, signIn, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function Navbar() {
  const { data: session, status } = useSession()

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold focus-ring">
              Ganges Healers
            </Link>
            
            <div className="hidden md:flex space-x-6">
              <Link href="/" className="text-sm font-medium hover:text-primary transition-colors focus-ring">
                Home
              </Link>
              <Link href="/services" className="text-sm font-medium hover:text-primary transition-colors focus-ring">
                Services
              </Link>
              {session && (
                <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors focus-ring">
                  Dashboard
                </Link>
              )}
              {session && (
                <Link href="/dashboard/membership" className="text-sm font-medium hover:text-primary transition-colors focus-ring">
                  Membership
                </Link>
              )}
              {session && (
                <Link href="/dashboard/billing" className="text-sm font-medium hover:text-primary transition-colors focus-ring">
                  Billing
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {status === "loading" ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : session ? (
              <div className="flex items-center space-x-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={session.user?.image || ""} />
                  <AvatarFallback>
                    {session.user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:block">
                  {session.user?.name}
                </span>
                <Button onClick={() => signOut()} variant="outline" size="sm">
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Button onClick={() => signIn()} variant="outline" size="sm">
                  Sign In
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Register</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}