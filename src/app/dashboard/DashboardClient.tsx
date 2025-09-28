'use client'

// Local client component for dashboard bookings list & invoice polling.

import React from 'react'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import BookingActions from '@/components/dashboard/BookingActions'
import Link from 'next/link'

interface BookingRecord {
  id: string
  status: string
  scheduledAt: Date
  service: { name: string }
  healer: { user: { name: string | null } | null }
  payment: { id: string; status: string | null; statusEnum: string | null; gateway: string | null } | null
}

export default function DashboardClient({ bookings }: { bookings: BookingRecord[] }) {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">My Bookings</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">No bookings yet. Browse services to book your first session.</p>
      )}

      <div className="grid gap-4">
        {bookings.map((b) => {
          const hasSuccessPayment = b.payment && (b.payment.status === 'success' || b.payment.statusEnum === 'SUCCESS')
          return (
            <Card key={b.id}>
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium">{b.service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(b.scheduledAt), 'EEE, dd MMM yyyy HH:mm')} · with {b.healer.user?.name ?? 'Healer'}
                  </div>
                  <div className="text-sm">
                    Status: <span className="font-medium">{b.status}</span> | Payment: {b.payment?.status ?? '-'} ({b.payment?.gateway ?? '-'})
                  </div>
                  {hasSuccessPayment && b.payment && (
                    <InvoiceLink paymentId={b.payment.id} />
                  )}
                </div>
                {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                  <BookingActions bookingId={b.id} scheduledAt={new Date(b.scheduledAt).toISOString()} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

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
      if (attempts < 30) {
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
