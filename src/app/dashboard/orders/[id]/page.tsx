import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

const shippingAddressSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  phone: z.string().optional(),
})

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending Payment", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  shipped: { label: "Shipped", variant: "secondary" },
  delivered: { label: "Delivered", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

function formatPaise(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100)
}

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { id } = await params
  // Include ownership in the query: other customers' orders are never disclosed.
  const order = await prisma.order.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      totalPaise: true,
      createdAt: true,
      shippingAddress: true,
      items: {
        select: {
          id: true,
          quantity: true,
          pricePaise: true,
          product: { select: { slug: true, title: true, imageUrl: true } },
        },
      },
    },
  })

  if (!order) notFound()
  const addressResult = shippingAddressSchema.safeParse(order.shippingAddress)
  const address = addressResult.success ? addressResult.data : null
  const status = statusLabels[order.status] ?? { label: order.status, variant: "outline" as const }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <Button asChild size="sm" variant="ghost">
        <Link href="/dashboard/orders">← All orders</Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Order Details</h1>
          <p className="mt-1 break-all text-sm text-muted-foreground">Order ID: {order.id}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">Items</h2>
        {order.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items were recorded for this order.</p>
        ) : (
          <ul className="divide-y">
            {order.items.map(item => (
              <li key={item.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                {item.product.imageUrl ? (
                  <Image src={item.product.imageUrl} alt={item.product.title} width={56} height={56} className="h-14 w-14 rounded object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded bg-muted" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/store/${encodeURIComponent(item.product.slug)}`} className="font-medium hover:underline">
                    {item.product.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                </div>
                <div className="text-right text-sm">
                  <span className="font-medium">{formatPaise(item.pricePaise)}</span>
                  <p className="text-xs text-muted-foreground">Line total</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between border-t pt-4 font-semibold">
          <span>Order total</span>
          <span>{formatPaise(order.totalPaise)}</span>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Shipping Address</h2>
        {address ? (
          <address className="text-sm not-italic leading-relaxed">
            <p className="font-medium">{address.name}</p>
            <p>{address.line1}</p>
            {address.line2 && <p>{address.line2}</p>}
            <p>{address.city}, {address.state} {address.postalCode}</p>
            {address.phone && <p>Phone: {address.phone}</p>}
          </address>
        ) : (
          <p className="text-sm text-muted-foreground">No shipping address was saved for this order.</p>
        )}
      </Card>
    </div>
  )
}
