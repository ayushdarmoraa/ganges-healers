'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function BlogError({ reset }: { reset: () => void }) {
  return <div role="alert" className="container mx-auto max-w-3xl p-6 py-16 text-center space-y-4"><h1 className="text-2xl font-semibold">Articles are temporarily unavailable</h1><p className="text-muted-foreground">Please try again in a moment.</p><Button onClick={reset}>Try again</Button><p><Link href="/" className="text-primary underline">Back to home</Link></p></div>
}
