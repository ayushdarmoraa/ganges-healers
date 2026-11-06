import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const queues = [
  { status: 'paid', label: 'Awaiting shipment' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
] as const
const pageSize = 25
const maxPage = 1000

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; page?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')

  const query = await searchParams
  const queue = queues.find(item => item.status === query.status) ?? queues[0]
  const requestedPage = typeof query.page === 'string' && /^\d+$/.test(query.page) ? Number(query.page) : 1
  const page = Math.min(Math.max(requestedPage, 1), maxPage)
  const order = queue.status === 'paid' ? 'asc' : 'desc'
  const rows = await prisma.order.findMany({
    where: { status: queue.status === 'delivered' ? { in: ['delivered', 'fulfilled'] } : queue.status },
    orderBy: [{ createdAt: order }, { id: order }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    select: { id: true, totalPaise: true, status: true, createdAt: true, _count: { select: { items: true } } },
  })
  const href = (status: string, currentPage = 1) =>
    `/admin/orders?status=${status}${currentPage > 1 ? `&page=${currentPage}` : ''}`

  return (
    <div className="container mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Store orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review paid orders and record shipment or delivery after it happens.</p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Order fulfillment queues">
        {queues.map(item => (
          <Button key={item.status} asChild size="sm" variant={queue.status === item.status ? 'default' : 'outline'}>
            <Link href={href(item.status)} aria-current={queue.status === item.status ? 'page' : undefined}>{item.label}</Link>
          </Button>
        ))}
      </nav>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.slice(0, pageSize).map(row => (
            <li key={row.id}>
              <Card className="flex flex-row flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link href={`/admin/orders/${encodeURIComponent(row.id)}`} className="break-all font-medium underline-offset-4 hover:underline">
                    Order {row.id}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {row.createdAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · {row._count.items} order lines · ₹{(row.totalPaise / 100).toFixed(2)}
                  </p>
                </div>
                <Badge variant="secondary">{queue.label}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No orders in this queue on this page.</p>}
      {(page > 1 || rows.length > pageSize && page < maxPage) && (
        <nav aria-label="Order queue pagination" className="flex gap-3">
          {page > 1 && <Button asChild variant="outline"><Link href={href(queue.status, page - 1)}>Previous page</Link></Button>}
          {rows.length > pageSize && page < maxPage && <Button asChild variant="outline"><Link href={href(queue.status, page + 1)}>Next page</Link></Button>}
        </nav>
      )}
    </div>
  )
}
