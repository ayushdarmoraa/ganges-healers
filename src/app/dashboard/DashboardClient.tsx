'use client'

// Local client component for dashboard bookings list & invoice polling.

import React from 'react'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import BookingActions from '@/components/dashboard/BookingActions'

interface BookingRecord {
  id: string
  status: string
  scheduledAt: Date
  service: { name: string }
  healer: { user: { name: string | null } | null }
  payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null; status: string | null; statusEnum: string | null; gateway: string | null } | null
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
                    <StaticInvoiceLink payment={b.payment} />
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

function StaticInvoiceLink({ payment }: { payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null } }) {
  const invId = payment.paymentId || payment.gatewayPaymentId || payment.id
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      {invId ? (
        <a
          href={`/api/invoices/${invId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >Invoice</a>
      ) : (
        <span>Invoice: Generating…</span>
      )}
    </div>
  )
}
