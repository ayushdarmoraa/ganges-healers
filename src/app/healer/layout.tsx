import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function HealerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")
  if (session.user.role !== "HEALER") redirect("/dashboard")

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-4">
        <Link
          href="/healer"
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          Dashboard
        </Link>
        <Link
          href="/healer/bookings"
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          Bookings
        </Link>
        <Link
          href="/healer/availability"
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          Availability
        </Link>
        <Link
          href="/healer/profile"
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          Profile
        </Link>
        <Link href="/healer/programs" className="text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted">Assigned Programs</Link>
      </nav>
      {children}
    </div>
  )
}
