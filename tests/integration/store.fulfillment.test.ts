import { randomUUID } from 'node:crypto'
import type { Order } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { orderFulfillmentSchema, orderFulfillmentVersion, recordOrderFulfillment } from '@/lib/store/fulfillment'
import { readOrderTracking } from '@/lib/store/order-shipping'

const address = { name: 'Fixture Customer', line1: '10 Test Lane', city: 'Delhi', state: 'Delhi', postalCode: '110001' }
let adminId = '', buyerId = ''

beforeEach(async () => {
  adminId = (await prisma.user.create({ data: { email: `shipment-admin-${randomUUID()}@example.test`, role: 'ADMIN' } })).id
  buyerId = (await prisma.user.create({ data: { email: `shipment-buyer-${randomUUID()}@example.test` } })).id
})

afterEach(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: adminId } })
  await prisma.user.deleteMany({ where: { id: { in: [adminId, buyerId] } } })
})

async function paidOrder({ savedAddress = true } = {}) {
  const order = await prisma.order.create({ data: {
    userId: buyerId, status: 'paid', totalPaise: 12500,
    ...(savedAddress ? { shippingAddress: address } : {}),
  } })
  const payment = await prisma.payment.create({ data: {
    userId: buyerId, gateway: 'razorpay', type: 'STORE', status: 'success', statusEnum: 'SUCCESS',
    gatewayPaymentId: randomUUID(), amountPaise: order.totalPaise, metadata: { orderId: order.id },
  } })
  return prisma.order.update({ where: { id: order.id }, data: { paymentId: payment.id } })
}

function ship(order: Order, extra = {}) {
  return orderFulfillmentSchema.parse({
    id: order.id, version: orderFulfillmentVersion(order),
    action: 'ship', carrier: 'Example Courier', trackingNumber: 'TRK-0123', ...extra,
  })
}

function deliver(order: Order) {
  return orderFulfillmentSchema.parse({ id: order.id, version: orderFulfillmentVersion(order), action: 'deliver' })
}

test('records shipment and delivery, preserving payment, address and tracking with one audit per transition', async () => {
  const order = await paidOrder()
  const before = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId! } })
  await recordOrderFulfillment(adminId, ship(order, { address: { ...address, line1: 'Different lane' } }))
  const shipped = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
  expect(shipped).toMatchObject({ status: 'shipped', shippingAddress: address, totalPaise: order.totalPaise, paymentId: order.paymentId })
  const shipment = readOrderTracking(shipped.status, shipped.trackingInfo)?.shipment
  expect(shipment).toMatchObject({ carrier: 'Example Courier', trackingNumber: 'TRK-0123', shippedAt: expect.any(String) })

  await recordOrderFulfillment(adminId, deliver(shipped))
  const delivered = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
  expect(delivered.status).toBe('delivered')
  expect(readOrderTracking(delivered.status, delivered.trackingInfo)).toEqual({ shipment, deliveredAt: expect.any(String) })
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId! } })).toEqual(before)
  const logs = await prisma.activityLog.findMany({ where: { userId: adminId, entityId: order.id }, select: { action: true, metadata: true } })
  expect(logs).toEqual(expect.arrayContaining([
    { action: 'store_order_shipped', metadata: { from: 'paid', to: 'shipped' } },
    { action: 'store_order_delivered', metadata: { from: 'shipped', to: 'delivered' } },
  ]))
  expect(logs).toHaveLength(2)
})

test('blocks non-admins and a demoted admin before changing a paid order', async () => {
  const order = await paidOrder()
  await expect(recordOrderFulfillment(buyerId, ship(order))).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await prisma.user.update({ where: { id: adminId }, data: { role: 'USER' } })
  await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order)
})

test('requires a matching captured payment and holds shipments with an unresolved refund', async () => {
  const order = await paidOrder()
  await prisma.payment.update({ where: { id: order.paymentId! }, data: { amountPaise: order.totalPaise - 1 } })
  await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
  await prisma.payment.update({ where: { id: order.paymentId! }, data: { amountPaise: order.totalPaise } })
  const refund = await prisma.refund.create({ data: { paymentId: order.paymentId!, amountPaise: 100, status: 'pending' } })
  await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toMatchObject({ code: 'REFUND_REVIEW' })
  expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order)
  await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } })
  await expect(recordOrderFulfillment(adminId, ship(order))).resolves.toMatchObject({ status: 'shipped' })
})

test('fills a missing legacy address with verified staff input and accepts delivery on an older shipment without tracking', async () => {
  const order = await paidOrder({ savedAddress: false })
  await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toMatchObject({ code: 'ADDRESS_REQUIRED' })
  await recordOrderFulfillment(adminId, ship(order, { address }))
  expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ shippingAddress: address })

  const legacy = await prisma.order.create({ data: { userId: buyerId, status: 'shipped', totalPaise: 12500 } })
  await recordOrderFulfillment(adminId, deliver(legacy))
  const saved = await prisma.order.findUniqueOrThrow({ where: { id: legacy.id } })
  expect(saved.status).toBe('delivered')
  expect(readOrderTracking(saved.status, saved.trackingInfo)).toEqual({ deliveredAt: expect.any(String) })
})

test('rejects stale reviews and lets only one concurrent submission record a shipment', async () => {
  const order = await paidOrder()
  const changed = await prisma.order.update({ where: { id: order.id }, data: {
    shippingAddress: { ...address, city: 'Mumbai' }, updatedAt: order.updatedAt,
  } })
  await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toMatchObject({ code: 'ORDER_CHANGED' })
  await expect(recordOrderFulfillment(adminId, deliver(changed))).rejects.toMatchObject({ code: 'ORDER_CHANGED' })
  const outcomes = await Promise.allSettled([
    recordOrderFulfillment(adminId, ship(changed)),
    recordOrderFulfillment(adminId, ship(changed)),
  ])
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'ORDER_CHANGED' } })
  expect(await prisma.activityLog.count({ where: { entityId: order.id } })).toBe(1)
})

test('rolls back the shipment if the audit write fails', async () => {
  const order = await paidOrder()
  const constraint = `qa_fulfillment_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${order.id}') NOT VALID`)
  try {
    await expect(recordOrderFulfillment(adminId, ship(order))).rejects.toThrow()
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order)
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`)
  }
})
