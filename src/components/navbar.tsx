"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useSession, signIn, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ShoppingCart, Menu, X } from "lucide-react"
import { useCart } from "@/components/store/CartProvider"
import SearchBar from "@/components/search/SearchBar"
import { useState } from "react"

const NotificationBell = dynamic(
  () => import("@/components/notifications/NotificationBell"),
  { ssr: false }
)

const publicLinks = [
  { href: "/services", label: "Services" },
  { href: "/programs", label: "Programs" },
  { href: "/audio", label: "Audio" },
  { href: "/blog", label: "Blog" },
  { href: "/store", label: "Store" },
  { href: "/courses", label: "Courses" },
]

const authLinks = [
  { href: "/community", label: "Community" },
  { href: "/dashboard", label: "Dashboard" },
]

export function Navbar() {
  const { data: session, status } = useSession()
  const { totalItems, setIsOpen } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLinks = [
    ...publicLinks,
    ...(session ? authLinks : []),
    ...(session?.user?.role === "HEALER"
      ? [{ href: "/healer", label: "Healer" }]
      : []),
  ]

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left: brand + desktop links */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold focus-ring">
              Ganges Healers
            </Link>

            <div className="hidden lg:flex space-x-5">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium hover:text-primary transition-colors focus-ring"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: search + icons + auth */}
          <div className="flex items-center space-x-3">
            <SearchBar />
            {session && <NotificationBell />}
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="relative p-2 hover:bg-muted rounded focus-ring"
              aria-label="Open cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>

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

            {/* Mobile hamburger */}
            <button
              type="button"
              className="lg:hidden p-2 hover:bg-muted rounded focus-ring"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block py-2 text-sm font-medium hover:text-primary transition-colors focus-ring"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}