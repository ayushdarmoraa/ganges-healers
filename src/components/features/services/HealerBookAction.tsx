"use client"

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import BookingModal from '@/components/booking/BookingModal'
import { track } from '@/lib/analytics/client'

interface HealerBookActionProps {
  healer: { id: string; name: string; experienceYears?: number; rating?: number }
  serviceId: string
  serviceName: string
}

export default function HealerBookAction({ healer, serviceId, serviceName }: HealerBookActionProps) {
  const [open, setOpen] = useState(false)

  const onOpen = useCallback(() => {
    setOpen(true)
    // Attempt to infer service slug from current path /services/[slug]
    const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/services\/([^/?#]+)/) : null
    const serviceSlug = match?.[1] || serviceName.toLowerCase().replace(/\s+/g, '-')
    track('booking_modal_open', {
      serviceSlug,
      programSlug: undefined,
      source: 'user-action',
      path,
      ts: Date.now(),
    })
  }, [serviceName])

  return (
    <>
      <Button onClick={onOpen} size="sm" className="w-full">Book</Button>
      {/* Keep modal mounted to avoid transient unmounts during route transitions */}
      <BookingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        healer={{
          id: healer.id,
          user: { name: healer.name },
          experienceYears: healer.experienceYears ?? 0,
          rating: healer.rating ?? 5,
        }}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    </>
  )
}
