'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function CommunityError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="container mx-auto p-6 max-w-3xl py-16 text-center space-y-4">
      <h1 className="text-2xl font-semibold">We couldn’t load the community</h1>
      <p className="text-muted-foreground">Please try again in a moment.</p>
      <div className="flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline"><Link href="/community">Back to Community</Link></Button>
      </div>
    </div>
  )
}
