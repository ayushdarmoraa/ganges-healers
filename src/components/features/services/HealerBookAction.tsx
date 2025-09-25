"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import BookingModal from '@/components/booking/BookingModal'

interface HealerBookActionProps {
  healer: { id: string; name: string; experienceYears?: number; rating?: number }
  serviceId: string
  serviceName: string
}

export default function HealerBookAction({ healer, serviceId, serviceName }: HealerBookActionProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="w-full">Book</Button>
      {open && (
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
      )}
    </>
  )
}
