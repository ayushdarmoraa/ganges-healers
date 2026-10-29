"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Props {
  bookingId: string
  scheduledAt: string // ISO
}

type CancellationResponse = {
  error?: string
  refund?: {
    status?: string
    message?: string
  }
}

export default function BookingActions({ bookingId, scheduledAt }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function cancel() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" })
        const data = await res.json().catch(() => ({})) as CancellationResponse
        if (!res.ok) {
          const message = 'error' in data && typeof data.error === 'string' ? data.error : undefined
          throw new Error(message || `Failed (${res.status})`)
        }
        const message = data.refund?.message || 'Booking cancelled.'
        if (data.refund?.status === 'SUCCESS' || data.refund?.status === 'NOT_REQUIRED') {
          toast.success(message)
        } else if (data.refund?.status === 'PENDING') {
          toast.info(message)
        } else {
          toast.error(message)
        }
        router.refresh()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not cancel (maybe <24h?)"
        toast.error(msg)
      }
    })
  }

  async function reschedulePlus1d() {
    startTransition(async () => {
      try {
        const newDate = new Date(scheduledAt)
        newDate.setDate(newDate.getDate() + 1)
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: newDate.toISOString() }),
        })
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}))
          const message = (data && typeof data === 'object' && 'error' in data) ? (data as { error?: string }).error : undefined
          throw new Error(message || `Failed (${res.status})`)
        }
        toast.success("Booking rescheduled +1 day")
        router.refresh()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not reschedule (maybe <24h?)"
        toast.error(msg)
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={cancel}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel"}
      </button>
      <button
        onClick={reschedulePlus1d}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
      >
        {pending ? "Rescheduling..." : "+1d"}
      </button>
    </div>
  )
}
