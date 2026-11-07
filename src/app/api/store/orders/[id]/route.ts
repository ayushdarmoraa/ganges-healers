import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { readOrderTracking } from "@/lib/store/order-shipping"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        totalPaise: true,
        shippingAddress: true,
        trackingInfo: true,
        paymentId: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            pricePaise: true,
            product: { select: { id: true, slug: true, title: true, imageUrl: true } },
          },
        },
      },
    })

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
    if (order.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { trackingInfo, ...details } = order
    const tracking = readOrderTracking(details.status, trackingInfo)
    return NextResponse.json({ order: { ...details, ...(tracking ? { tracking } : {}) } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error("[store][orders][id][error]", err)
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 })
  }
}
