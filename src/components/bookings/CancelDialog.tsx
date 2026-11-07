"use client"

import { useState, useId } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NormalizedBooking } from '@/app/dashboard/bookings/page'
import { track } from '@/lib/analytics/client'

type CancellationRefund = {
  band: 'FULL' | 'HALF' | 'NONE'
  refundPaise: number
  status: 'NOT_REQUIRED' | 'UNAVAILABLE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN'
  message: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: NormalizedBooking
  onSuccess: (result: CancellationRefund) => void
}

function isRefundStatus(value: unknown): value is CancellationRefund['status'] {
  return value === 'NOT_REQUIRED' || value === 'UNAVAILABLE' || value === 'PENDING'
    || value === 'SUCCESS' || value === 'FAILED' || value === 'UNKNOWN'
}

export default function CancelDialog({ open, onOpenChange, booking, onSuccess }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>('')
  const titleId = useId()

  async function confirm() {
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Failed (${res.status})`)
      }
      const j: unknown = await res.json()
      if (!j || typeof j !== 'object' || !('refund' in j)) {
        throw new Error('Cancellation result could not be confirmed. Refresh your bookings.')
      }
      const refund = j.refund
      if (!refund || typeof refund !== 'object' || !('status' in refund) || !('message' in refund)
        || !('band' in refund) || !('refundPaise' in refund)) {
        throw new Error('Cancellation result could not be confirmed. Refresh your bookings.')
      }
      const { band, refundPaise, status, message } = refund
      if ((band !== 'FULL' && band !== 'HALF' && band !== 'NONE')
        || typeof refundPaise !== 'number' || !Number.isSafeInteger(refundPaise) || refundPaise < 0
        || !isRefundStatus(status) || typeof message !== 'string') {
        throw new Error('Cancellation result could not be confirmed. Refresh your bookings.')
      }
      const result: CancellationRefund = { band, refundPaise, status, message }
      onSuccess(result)
      track('booking_cancel_success', { bookingId: booking.id, serviceSlug: booking.serviceSlug, path: '/dashboard/bookings', ts: Date.now() })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Cancel booking</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">Confirm cancellation and review refund policy</DialogDescription>
        <div className="space-y-4">
          <p>Refund eligibility is calculated from your saved booking and payment. Paid Razorpay bookings are eligible for a full refund at least 48 hours before the session, or 50% at least 24 hours before. Unpaid and credit bookings do not receive a cash refund; provider processing may require review.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>{pending ? 'Cancelling...' : 'Confirm cancel'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
