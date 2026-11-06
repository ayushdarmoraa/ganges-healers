"use client"

import type { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import BookingReviewForm, { type BookingReview } from './BookingReviewForm'
import { safeMeetingLink } from '@/lib/bookings/session-delivery'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'

type Props = {
  booking: NormalizedBooking
  onReschedule: () => void
  onCancel: () => void
  onReviewSaved?: (review: BookingReview) => void
}

function formatLocal(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-IN', { timeZone: BOOKING_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-IN', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' })} IST`
}

export default function BookingCard({ booking, onReschedule, onCancel, onReviewSaved }: Props) {
  const { serviceName, healerName, startIso, status, isCancelable, isReschedulable } = booking
  const meeting = ['CONFIRMED', 'RESCHEDULED'].includes(status) ? safeMeetingLink(booking.meetingLink) : null

  return (
    <Card className="p-4 space-y-4" data-test="booking-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="font-medium">{serviceName}</div>
          <div className="text-sm text-muted-foreground">with {healerName}</div>
          <div className="text-sm">{formatLocal(startIso)}</div>
          <a className="text-sm underline" href={`/api/bookings/${encodeURIComponent(booking.id)}/calendar`}>Download calendar</a>
          {meeting ? <div><a className="inline-flex rounded-md border px-3 py-2 text-sm font-medium focus-ring" href={meeting} target="_blank" rel="noopener noreferrer">Join session</a></div>
            : ['CONFIRMED', 'RESCHEDULED'].includes(status) ? <p className="text-sm text-muted-foreground">Your practitioner will add the session link here.</p> : null}
          <div className={cn('text-xs inline-flex rounded px-2 py-0.5 border',
            status === 'CANCELLED' ? 'border-destructive text-destructive' : 'border-muted-foreground text-muted-foreground'
          )} aria-label={`status ${status}`}>{status}</div>
        </div>
        {status !== 'COMPLETED' ? <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!isReschedulable} onClick={onReschedule} aria-disabled={!isReschedulable} title={!isReschedulable ? 'Cannot reschedule within 24h' : 'Reschedule'}>
            Reschedule
          </Button>
          <Button variant="destructive" disabled={!isCancelable} onClick={onCancel} aria-disabled={!isCancelable} title={!isCancelable ? 'Cannot cancel within 24h' : 'Cancel'}>
            Cancel
          </Button>
        </div> : null}
      </div>
      {status === 'COMPLETED' && (booking.canReview || booking.review) && onReviewSaved ? (
        <BookingReviewForm bookingId={booking.id} serviceName={serviceName} review={booking.review} onSaved={onReviewSaved} />
      ) : null}
    </Card>
  )
}
