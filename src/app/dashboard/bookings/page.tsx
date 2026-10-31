'use client'

import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import BookingCard from '../../../components/bookings/BookingCard'
import RescheduleModal from '../../../components/bookings/RescheduleModal'
import CancelDialog from '../../../components/bookings/CancelDialog'
import { track } from '@/lib/analytics/client'
import { toast } from 'sonner'

type ApiBooking = {
  id: string
  userId: string
  healerId: string
  serviceId: string
  scheduledAt: string
  status: 'PENDING'|'SCHEDULED'|'CONFIRMED'|'RESCHEDULED'|'CANCELLED'|'COMPLETED'
  durationMin?: number | null
  pricePaise?: number | null
  healer?: { user?: { name?: string | null } | null } | null
  service?: { name?: string | null; category?: string | null; slug?: string | null } | null
  payment?: { status?: string | null; amountPaise?: number | null } | null
}

export type NormalizedBooking = {
  id: string
  serviceSlug: string
  serviceName: string
  healerName: string
  startIso: string
  status: ApiBooking['status']
  isCancelable: boolean
  isReschedulable: boolean
  healerId: string
  serviceId: string
  amountPaise: number
}

export default function MyBookingsPage() {
  const [items, setItems] = useState<NormalizedBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)

  const selectedForReschedule = useMemo(() => items.find(i => i.id === rescheduleId) || null, [items, rescheduleId])
  const selectedForCancel = useMemo(() => items.find(i => i.id === cancelId) || null, [items, cancelId])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/bookings', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const data = await res.json()
        const rows: ApiBooking[] = data?.data || []
        const now = Date.now()
        const normalized: NormalizedBooking[] = rows.map((b) => {
          const start = new Date(b.scheduledAt)
          const hoursUntil = (start.getTime() - now) / 36e5
          const status = b.status
          const active = status !== 'CANCELLED' && status !== 'COMPLETED'
          return {
            id: b.id,
            serviceSlug: b.service?.slug || '',
            serviceName: b.service?.name || 'Service',
            healerName: b.healer?.user?.name || 'Healer',
            startIso: start.toISOString(),
            status,
            isCancelable: active && hoursUntil >= 24,
            isReschedulable: active && hoursUntil >= 24,
            healerId: b.healerId,
            serviceId: b.serviceId,
            amountPaise: Number.isFinite(b.payment?.amountPaise) ? (b.payment?.amountPaise || 0) : (b.pricePaise || 0),
          }
        })
        if (mounted) setItems(normalized)
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load bookings')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const upcoming = items.filter(i => new Date(i.startIso).getTime() > now && i.status !== 'CANCELLED')
    const past = items.filter(i => new Date(i.startIso).getTime() <= now || i.status === 'CANCELLED' || i.status === 'COMPLETED')
    return { upcoming, past }
  }, [items])

  function onRescheduleOpen(b: NormalizedBooking) {
    setRescheduleId(b.id)
    track('booking_reschedule_open', { bookingId: b.id, serviceSlug: b.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
  }
  function onCancelOpen(b: NormalizedBooking) {
    setCancelId(b.id)
    track('booking_cancel_open', { bookingId: b.id, serviceSlug: b.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
  }

  function applyUpdate(updated: NormalizedBooking) {
    setItems((prev) => prev.map(i => i.id === updated.id ? updated : i))
  }
  function applyCancel(id: string) {
    setItems((prev) => prev.map(i => i.id === id ? { ...i, status: 'CANCELLED', isCancelable: false, isReschedulable: false } : i))
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">My Bookings</h1>

      {loading ? (
        <Card className="p-6">Loading...</Card>
      ) : error ? (
        <Card className="p-6 text-red-600">{error}</Card>
      ) : (
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="mt-4 space-y-3">
            {upcoming.length === 0 ? (
              <Card className="p-6 text-muted-foreground">No upcoming bookings.</Card>
            ) : upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} onReschedule={() => onRescheduleOpen(b)} onCancel={() => onCancelOpen(b)} />
            ))}
          </TabsContent>
          <TabsContent value="past" className="mt-4 space-y-3">
            {past.length === 0 ? (
              <Card className="p-6 text-muted-foreground">No past bookings.</Card>
            ) : past.map((b) => (
              <BookingCard key={b.id} booking={b} onReschedule={() => onRescheduleOpen(b)} onCancel={() => onCancelOpen(b)} />
            ))}
          </TabsContent>
        </Tabs>
      )}

      {/* Reschedule Modal */}
      {selectedForReschedule && (
        <RescheduleModal
          open={!!selectedForReschedule}
          onOpenChange={(open: boolean) => { if (!open) setRescheduleId(null) }}
          booking={selectedForReschedule}
          onSuccess={(updated: NormalizedBooking) => {
            applyUpdate(updated)
            setRescheduleId(null)
          }}
        />
      )}

      {/* Cancel Dialog */}
      {selectedForCancel && (
        <CancelDialog
          open={!!selectedForCancel}
          onOpenChange={(open: boolean) => { if (!open) setCancelId(null) }}
          booking={selectedForCancel}
          onSuccess={(result) => {
            applyCancel(selectedForCancel.id)
            setCancelId(null)
            if (result.status === 'SUCCESS' || result.status === 'NOT_REQUIRED') {
              toast.success(result.message)
            } else if (result.status === 'PENDING') {
              toast.info(result.message)
            } else {
              toast.error(result.message)
            }
          }}
        />
      )}
    </div>
  )
}
