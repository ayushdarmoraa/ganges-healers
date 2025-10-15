"use client"

import { useEffect, useRef, useState } from 'react'
import BookingModal from '@/components/booking/BookingModal'
import { track } from '@/lib/analytics/client'

type HealerInfo = { id: string; name: string; experienceYears?: number; rating?: number }

export default function BookingAutoOpen({
  enabled,
  programSlug,
  productSlug,
  serviceSlug,
  healer,
  serviceId,
  serviceName,
}: {
  enabled: boolean
  programSlug?: string
  productSlug?: string
  serviceSlug: string
  healer: HealerInfo
  serviceId: string
  serviceName: string
}) {
  const [open, setOpen] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    if (enabled) {
      setOpen(true)
      if (!firedRef.current) {
        firedRef.current = true
        track('booking_modal_open', {
          serviceSlug,
          programSlug,
          source: 'query-openBooking',
          path: typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '',
          ts: Date.now(),
        })
      }
    }
  }, [enabled, serviceSlug, programSlug, productSlug])

  if (!open) return null
  return (
    <BookingModal
      isOpen={open}
      onClose={() => setOpen(false)}
      healer={{ id: healer.id, user: { name: healer.name }, experienceYears: healer.experienceYears ?? 0, rating: healer.rating ?? 5 }}
      serviceId={serviceId}
      serviceName={serviceName}
      programSlug={programSlug}
  productSlug={productSlug}
    />
  )
}
