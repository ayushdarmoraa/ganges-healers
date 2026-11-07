import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AnalyticsCharts from './AnalyticsCharts'
import LiveFunnelPanel from './LiveFunnelPanel'

export const dynamic = 'force-dynamic'

export default async function AdminAnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Run all queries in parallel
  const [
    totalOrders,
    completedOrders,
    ordersToday,
    revenueResult,
    revenueTodayResult,
    revenueByChakra,
    revenueBySource,
    revenueByIntention,
    topProducts,
    quizLeadCount,
    abandonedCartCount,
    dailyRevenue,
    revenueByVariant,
  ] = await Promise.all([
    // Total orders (all time)
    prisma.order.count(),

    // Completed orders (not pending_payment)
    prisma.order.count({
      where: { status: { not: 'pending_payment' } },
    }),

    // Orders today
    prisma.order.count({
      where: {
        createdAt: { gte: todayStart },
        status: { not: 'pending_payment' },
      },
    }),

    // Total revenue (completed orders)
    prisma.order.aggregate({
      _sum: { totalPaise: true },
      where: { status: { not: 'pending_payment' } },
    }),

    // Revenue today
    prisma.order.aggregate({
      _sum: { totalPaise: true },
      where: {
        createdAt: { gte: todayStart },
        status: { not: 'pending_payment' },
      },
    }),

    // Revenue by chakra
    prisma.order.groupBy({
      by: ['chakra'],
      _sum: { totalPaise: true },
      _count: true,
      where: { status: { not: 'pending_payment' }, chakra: { not: null } },
      orderBy: { _sum: { totalPaise: 'desc' } },
    }),

    // Revenue by source
    prisma.order.groupBy({
      by: ['source'],
      _sum: { totalPaise: true },
      _count: true,
      where: { status: { not: 'pending_payment' }, source: { not: null } },
      orderBy: { _sum: { totalPaise: 'desc' } },
    }),

    // Revenue by intention
    prisma.order.groupBy({
      by: ['intention'],
      _sum: { totalPaise: true },
      _count: true,
      where: { status: { not: 'pending_payment' }, intention: { not: null } },
      orderBy: { _sum: { totalPaise: 'desc' } },
    }),

    // Top products
    prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { pricePaise: true, quantity: true },
      _count: true,
      orderBy: { _sum: { pricePaise: 'desc' } },
      take: 10,
    }),

    // Total quiz leads
    prisma.quizLead.count(),

    // Total abandoned carts (not recovered)
    prisma.abandonedCart.count({
      where: { recoveredAt: null },
    }),

    // Daily revenue for the last 30 days
    prisma.$queryRaw<Array<{ date: Date; revenue: bigint; orders: bigint }>>`
      SELECT DATE("createdAt") as date,
             SUM("totalPaise") as revenue,
             COUNT(*) as orders
      FROM "Order"
      WHERE status != 'pending_payment'
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,

    // Revenue by A/B variant
    prisma.order.groupBy({
      by: ['experimentVariant'],
      _sum: { totalPaise: true },
      _count: true,
      where: { status: { not: 'pending_payment' }, experimentVariant: { not: null } },
      orderBy: { _sum: { totalPaise: 'desc' } },
    }),
  ])

  // Resolve product names for top products
  const productIds = topProducts.map((p) => p.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, title: true },
  })
  const productNameMap = new Map(products.map((p) => [p.id, p.title]))

  const totalRevenue = revenueResult._sum.totalPaise ?? 0
  const todayRevenue = revenueTodayResult._sum.totalPaise ?? 0
  const conversionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : '0'

  // Serialize data for client component
  const chartData = {
    dailyRevenue: dailyRevenue.map((d) => ({
      date: new Date(d.date).toISOString().slice(0, 10),
      revenue: Number(d.revenue) / 100,
      orders: Number(d.orders),
    })),
    revenueByChakra: revenueByChakra.map((r) => ({
      name: r.chakra ?? 'Unknown',
      revenue: (r._sum.totalPaise ?? 0) / 100,
      orders: r._count,
    })),
    revenueBySource: revenueBySource.map((r) => ({
      name: r.source ?? 'Direct',
      revenue: (r._sum.totalPaise ?? 0) / 100,
      orders: r._count,
    })),
    revenueByIntention: revenueByIntention.map((r) => ({
      name: r.intention ?? 'Unknown',
      revenue: (r._sum.totalPaise ?? 0) / 100,
      orders: r._count,
    })),
    topProducts: topProducts.map((p) => ({
      name: productNameMap.get(p.productId) ?? p.productId,
      revenue: (p._sum.pricePaise ?? 0) / 100,
      sold: p._sum.quantity ?? 0,
    })),
    revenueByVariant: revenueByVariant.map((r) => ({
      name: r.experimentVariant ?? 'None',
      revenue: (r._sum.totalPaise ?? 0) / 100,
      orders: r._count,
    })),
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>
        <a href="/admin" className="text-sm text-muted-foreground hover:underline">← Back to Admin</a>
      </div>

      {/* Live View (client component with polling) */}
      <LiveFunnelPanel />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={`₹${(totalRevenue / 100).toLocaleString('en-IN')}`} />
        <KpiCard label="Revenue Today" value={`₹${(todayRevenue / 100).toLocaleString('en-IN')}`} />
        <KpiCard label="Completed Orders" value={String(completedOrders)} />
        <KpiCard label="Orders Today" value={String(ordersToday)} />
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <FunnelCard label="Quiz Leads" value={quizLeadCount} />
        <FunnelCard label="Completed Orders" value={completedOrders} />
        <FunnelCard label="Conversion Rate" value={`${conversionRate}%`} />
        <FunnelCard label="Abandoned Carts" value={abandonedCartCount} />
        <FunnelCard label="Total Orders" value={totalOrders} />
      </div>

      {/* Charts (client component) */}
      <AnalyticsCharts data={chartData} />
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

function FunnelCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
