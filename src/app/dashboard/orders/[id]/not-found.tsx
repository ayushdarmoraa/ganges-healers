import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function OrderNotFound() {
  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Order unavailable</h1>
      <p className="text-muted-foreground">We couldn’t find this order in your account.</p>
      <Button asChild variant="outline"><Link href="/dashboard/orders">Back to all orders</Link></Button>
    </div>
  )
}
