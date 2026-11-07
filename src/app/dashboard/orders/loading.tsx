import { Card } from "@/components/ui/card"

export default function OrdersLoading() {
  return (
    <div role="status" aria-live="polite" className="container mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-muted-foreground">Loading order information…</p>
      {[0, 1, 2].map(index => (
        <Card key={index} aria-hidden="true" className="animate-pulse space-y-4 p-5">
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="h-16 rounded bg-muted" />
        </Card>
      ))}
    </div>
  )
}
