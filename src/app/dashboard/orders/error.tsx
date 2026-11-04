"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function OrdersError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="container mx-auto max-w-3xl space-y-4 p-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Orders are temporarily unavailable</h1>
      <p className="text-muted-foreground">Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
      <p><Link href="/dashboard/orders" className="text-primary underline">Back to all orders</Link></p>
    </div>
  )
}
