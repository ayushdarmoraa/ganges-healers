import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import BookingActions from "@/components/dashboard/BookingActions"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    include: { service: true, healer: { include: { user: true } }, payment: true },
  })
  type BookingItem = typeof bookings[number]

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">My Bookings</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">No bookings yet. Browse services to book your first session.</p>
      )}

      <div className="grid gap-4">
        {bookings.map((b: BookingItem) => (
          <Card key={b.id}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="font-medium">{b.service.name}</div>
                <div className="text-sm text-muted-foreground">
                  {format(b.scheduledAt, "EEE, dd MMM yyyy HH:mm")} · with {b.healer.user?.name ?? "Healer"}
                </div>
                <div className="text-sm">
                  Status: <span className="font-medium">{b.status}</span> | Payment: {b.payment?.status ?? "-"} ({b.payment?.gateway ?? "-"})
                </div>
              </div>

              {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                <BookingActions bookingId={b.id} scheduledAt={b.scheduledAt.toISOString()} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}