"use client"

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/client'
import { toast } from 'sonner'

type Props = {
  programSlug: string
  serviceSlug?: string
}

export default function ProgramEnrollSoon({ programSlug, serviceSlug }: Props) {
  const onClick = () => {
    // non-blocking toast acknowledgement
  toast('Got it — we\u2019ll announce soon')
    // fire client-only analytics
    if (typeof window !== 'undefined') {
      const path = window.location.pathname + window.location.search
      track('program_enroll_click', {
        programSlug,
        serviceSlug,
        path,
        ts: Date.now(),
      })
    }
  }

  return (
    <Card className="mt-6 p-4 border-dashed">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-base font-medium">Enroll (coming soon)</div>
          <div className="text-sm text-muted-foreground">We&apos;re putting the final touches on enrollments. Launching soon.</div>
        </div>
  <Button type="button" onClick={onClick} className="shrink-0">I&apos;m interested</Button>
      </div>
    </Card>
  )
}
