import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  const invoices = await prisma.invoice.findMany({
    where: { payment: { userId: session.user.id } },
    orderBy: { issuedAt: 'desc' },
    take: 100,
    include: { payment: true }
  })
  // Fallback lightweight structural type (avoids depending on generated Prisma model types here)
  interface InvoiceRow {
    id: string
    issuedAt: Date
    totalPaise: number
    pdfUrl: string | null
    payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null; type?: string | null } | null
  }
  const typedInvoices = invoices as unknown as InvoiceRow[]
  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
      <table className="w-full text-sm border rounded overflow-hidden">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="p-2">Date</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Type</th>
            <th className="p-2">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {typedInvoices.map((inv) => (
            <tr key={inv.id} className="border-t">
              <td className="p-2 whitespace-nowrap">{inv.issuedAt.toISOString().slice(0,10)}</td>
              <td className="p-2">₹{(inv.totalPaise/100).toFixed(2)}</td>
              <td className="p-2">{inv.payment?.type || 'SESSION'}</td>
              <td className="p-2">
                {inv.pdfUrl ? (
                  <Link href={inv.pdfUrl} className="text-primary underline" target="_blank" rel="noopener noreferrer">Download</Link>
                ) : (() => {
                  const invId = inv.payment?.paymentId || inv.payment?.gatewayPaymentId || inv.payment?.id
                  return invId ? (
                    <a
                      href={`/api/invoices/${invId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >Invoice</a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Generating…</span>
                  )
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
