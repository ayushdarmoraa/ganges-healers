import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orderFulfillmentSchema, orderFulfillmentVersion, recordOrderFulfillment, StoreFulfillmentError } from '@/lib/store/fulfillment'
import { readOrderTracking, staffShippingAddressSchema } from '@/lib/store/order-shipping'
import { CatalogEditor } from '@/components/admin/catalog-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const dynamic = 'force-dynamic'

const addressFields = [
  { key: 'name', label: 'Recipient name', max: 100 },
  { key: 'line1', label: 'Street address', max: 200 },
  { key: 'line2', label: 'Address line 2', max: 200, optional: true },
  { key: 'city', label: 'City', max: 100 },
  { key: 'state', label: 'State', max: 100 },
  { key: 'postalCode', label: 'Postal code', max: 20 },
  { key: 'phone', label: 'Phone', max: 32, optional: true },
] as const

async function saveFulfillment(id: string, version: string, action: 'ship' | 'deliver', needsAddress: boolean, form: FormData) {
  'use server'

  try {
    const actor = await requireCurrentAdmin()
    if (action === 'deliver' && form.get('confirmed') !== 'on') {
      return { error: 'Confirm that this order was delivered before saving.' }
    }
    const fields = action === 'ship' ? {
      carrier: form.get('carrier'),
      trackingNumber: form.get('trackingNumber'),
      address: needsAddress ? Object.fromEntries(addressFields.map(({ key }) => [key, form.get(key) ?? undefined])) : undefined,
    } : {}
    const parsed = orderFulfillmentSchema.safeParse({ id, version, action, ...fields })
    if (!parsed.success) return { error: 'Check the carrier and tracking number, and complete the shipping address if requested.' }

    await recordOrderFulfillment(actor.id, parsed.data)
    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${id}`)
    revalidatePath('/dashboard/orders')
    revalidatePath(`/dashboard/orders/${id}`)
    return {}
  } catch (error) {
    if (error instanceof StoreFulfillmentError) return { error: error.message }
    if (error instanceof Error && 'status' in error && error.status === 403) return { error: 'Administrator access is required.' }
    console.error('[store][fulfillment][save_failed]', { type: error instanceof Error ? error.name : 'unknown' })
    return { error: 'The order could not be updated. Try again.' }
  }
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')

  const { id } = await params
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, status: true, paymentId: true, totalPaise: true, updatedAt: true,
      shippingAddress: true, trackingInfo: true,
      items: { select: { id: true, quantity: true, pricePaise: true, product: { select: { title: true } } } },
    },
  })
  if (!order) notFound()
  const address = staffShippingAddressSchema.safeParse(order.shippingAddress)
  const tracking = readOrderTracking(order.status, order.trackingInfo)
  const shipping = order.status === 'paid'
  const editing = shipping || order.status === 'shipped'
  const version = orderFulfillmentVersion(order)

  return (
    <div className="container mx-auto max-w-3xl space-y-5 px-4 py-8">
      <Button asChild variant="ghost"><Link href="/admin/orders">← Store orders</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Order fulfillment</h1>
          <p className="break-all text-sm text-muted-foreground">{order.id}</p>
        </div>
        <Badge variant="secondary">{order.status === 'paid' ? 'Awaiting shipment' : order.status.replaceAll('_', ' ')}</Badge>
      </div>

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-semibold">Items</h2>
        <ul className="space-y-1 text-sm">
          {order.items.map(item => <li key={item.id}>{item.quantity} × {item.product.title} · ₹{(item.pricePaise / 100).toFixed(2)}</li>)}
        </ul>
        <p className="font-medium">Total ₹{(order.totalPaise / 100).toFixed(2)}</p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Shipping address</h2>
        {address.success ? (
          <address className="text-sm not-italic leading-relaxed">
            <p className="font-medium">{address.data.name}</p>
            <p>{address.data.line1}</p>
            {address.data.line2 && <p>{address.data.line2}</p>}
            <p>{address.data.city}, {address.data.state} {address.data.postalCode}</p>
            {address.data.phone && <p>{address.data.phone}</p>}
          </address>
        ) : <p className="text-sm text-muted-foreground">This order has no complete shipping address on file.</p>}
      </Card>

      {tracking && (
        <Card className="space-y-2 p-5">
          <h2 className="text-lg font-semibold">Saved tracking</h2>
          {tracking.shipment && <p className="break-words text-sm">{tracking.shipment.carrier} · {tracking.shipment.trackingNumber}</p>}
          {tracking.deliveredAt && <p className="text-sm">Delivery recorded {new Date(tracking.deliveredAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.</p>}
        </Card>
      )}

      {editing && (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">{shipping ? 'Record shipment' : 'Record delivery'}</h2>
          <p className="text-sm text-muted-foreground">
            {shipping ? 'Save the carrier and tracking number after handing the parcel to the carrier.' : 'Save delivery after confirming receipt.'}
          </p>
          <CatalogEditor key={version} action={saveFulfillment.bind(null, order.id, version, shipping ? 'ship' : 'deliver', !address.success)}
            item={shipping ? 'Shipment' : 'Delivery'} submitLabel={shipping ? 'Mark shipped' : 'Mark delivered'}>
            {shipping ? (
              <>
                <div className="space-y-1"><Label htmlFor="shipment-carrier">Carrier</Label><Input id="shipment-carrier" name="carrier" required maxLength={100} /></div>
                <div className="space-y-1"><Label htmlFor="shipment-number">Tracking number</Label><Input id="shipment-number" name="trackingNumber" required maxLength={100} /></div>
                {!address.success && (
                  <fieldset className="space-y-3 md:col-span-3">
                    <legend className="font-medium">Verified shipping address</legend>
                    <p className="text-sm text-muted-foreground">Enter the address used for this shipment.</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {addressFields.map(field => (
                        <div className="space-y-1" key={field.key}>
                          <Label htmlFor={`shipping-${field.key}`}>{field.label}</Label>
                          <Input id={`shipping-${field.key}`} name={field.key} required={!('optional' in field)} maxLength={field.max} />
                        </div>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            ) : (
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <input type="checkbox" name="confirmed" required />
                I confirmed this order was delivered.
              </label>
            )}
          </CatalogEditor>
        </Card>
      )}
    </div>
  )
}
