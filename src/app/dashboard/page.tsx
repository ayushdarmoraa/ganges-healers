import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import BookingActions from "@/components/dashboard/BookingActions"
import Link from 'next/link'
import React from 'react'

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
        {bookings.map((b: BookingItem) => {
          const hasSuccessPayment = b.payment && (b.payment.status === 'success' || b.payment.statusEnum === 'SUCCESS')
          return (
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
                  {hasSuccessPayment && (
                    <InvoiceLink paymentId={b.payment!.id} />
                  )}
                </div>
                {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                  <BookingActions bookingId={b.id} scheduledAt={b.scheduledAt.toISOString()} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// Client component for invoice link with polling
function InvoiceLink({ paymentId }: { paymentId: string }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      attempts++
      try {
        const res = await fetch(`/api/invoices/${paymentId}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) { setUrl(data.invoice?.pdfUrl || null); setLoading(false) }
          return
        }
      } catch {/* ignore */}
      if (attempts < 30) { // ~15s at 500ms interval
        setTimeout(poll, 500)
      } else if (!cancelled) {
        setLoading(false)
      }
    }
    poll()
    return () => { cancelled = true }
  }, [paymentId])
  if (loading) return <div className="mt-2 text-xs text-muted-foreground">Invoice: Generating…</div>
  if (url) return <Link href={url} className="mt-2 inline-block text-sm text-primary underline">View invoice</Link>
  return <div className="mt-2 text-xs text-muted-foreground">Invoice unavailable</div>
}