"use client"

import { useCallback, useEffect, useState, useId } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { track } from '@/lib/analytics/client'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: NormalizedBooking
  onSuccess: (updated: NormalizedBooking) => void
}

type Slot = { iso: string; label: string }

export default function RescheduleModal({ open, onOpenChange, booking, onSuccess }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedDatetime, setSelectedDatetime] = useState<string>('')
  const [pending, setPending] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState<string>('')
  const dateId = useId()
  const titleId = useId()

  // Preview the same owned-booking duration and conflicts checked by PUT.
  useEffect(() => {
    if (!open || !selectedDate) {
      setSlots([])
      return
    }
    const controller = new AbortController()
    setLoadingSlots(true)
    setSlots([])
    setSelectedDatetime('')
    setError('')
    const query = new URLSearchParams({ healerId: booking.healerId, date: selectedDate, bookingId: booking.id })
    ;(async () => {
      try {
        const response = await fetch(`/api/availability?${query}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || 'Could not load available times')
        const available: Array<{ time: string; available: boolean }> = body.data.slots
        const earliest = Date.now() + 24 * 60 * 60 * 1000
        const options = available.filter(slot => slot.available).map(slot => {
          const instant = clinicSlotInstant(selectedDate, slot.time)
          return {
            iso: instant.toISOString(),
            label: instant.toLocaleTimeString('en-US', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' }),
          }
        }).filter(slot => new Date(slot.iso).getTime() >= earliest)
        if (!controller.signal.aborted) setSlots(options)
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load available times')
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false)
      }
    })()
    return () => controller.abort()
  }, [open, selectedDate, booking.healerId, booking.id])

  useEffect(() => {
    if (open) {
      setSelectedDate('')
      setSelectedDatetime('')
      setError('')
    }
  }, [open])

  const submit = useCallback(async () => {
    if (!selectedDatetime) return
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: selectedDatetime }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Failed (${res.status})`)
      }
      const body = await res.json()
      const newStart = new Date(body.data.scheduledAt)
      const now = Date.now()
      const hoursUntil = (newStart.getTime() - now) / 36e5
      const updated: NormalizedBooking = {
        ...booking,
        startIso: newStart.toISOString(),
        status: 'RESCHEDULED',
        isCancelable: hoursUntil >= 24,
        isReschedulable: hoursUntil >= 24,
      }
      onSuccess(updated)
      track('booking_reschedule_success', { bookingId: booking.id, serviceSlug: booking.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reschedule')
    } finally {
      setPending(false)
    }
  }, [booking, onOpenChange, onSuccess, selectedDatetime])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Reschedule booking</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Pick a new time for your session</DialogDescription>

        <div className="space-y-4">
          <div>
            <label htmlFor={dateId} className="text-sm font-medium">Select date</label>
            <input id={dateId} className="mt-1 w-full border rounded p-2" type="date" min={clinicDate(new Date(Date.now() + 24 * 60 * 60 * 1000))} value={selectedDate} onChange={(e) => { setSelectedDatetime(''); setSelectedDate(e.target.value) }} />
          </div>
          {selectedDate && (
            <div>
              <div className="text-sm mb-2">Available times (India time)</div>
              {loadingSlots ? <p>Loading available times...</p> : !slots.length && !error ? <p>No available times for this date.</p> : null}
              <div className="grid grid-cols-3 gap-2">
                {slots.map(s => (
                  <Button key={s.iso} type="button" variant={selectedDatetime === s.iso ? 'default' : 'outline'} onClick={() => setSelectedDatetime(s.iso)}>{s.label}</Button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={submit} disabled={!selectedDatetime || pending || loadingSlots}>{pending ? 'Saving...' : 'Confirm'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
