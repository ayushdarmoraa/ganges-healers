'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function BlogAdminError({ reset }: { reset: () => void }) {
  return <div role="alert" className="container mx-auto max-w-3xl p-6 py-16 text-center space-y-4"><h1 className="text-2xl font-semibold">Article management is temporarily unavailable</h1><p>Please try again in a moment.</p><Button onClick={reset}>Try again</Button><p><Link href="/admin" className="text-primary underline">Back to Admin</Link></p></div>
}
