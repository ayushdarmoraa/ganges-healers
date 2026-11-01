'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ModerationError({ reset }: { reset: () => void }) {
  return <div role="alert" className="container mx-auto max-w-3xl px-4 py-16 text-center space-y-4"><h1 className="text-2xl font-semibold">Moderation is temporarily unavailable</h1><p className="text-muted-foreground">Please try again in a moment.</p><div className="flex justify-center gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/admin">Back to Admin</Link></Button></div></div>
}
