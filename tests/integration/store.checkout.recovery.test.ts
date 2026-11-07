import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { POST as checkout } from '@/app/api/store/checkout/route'
import { POST as createPayment } from '@/app/api/payments/create-order/route'
import { getRazorpayClient } from '@/lib/razorpay'
import { getSessionId } from '@/lib/analytics/session'

let mockUserId: string | undefined
jest.mock('@/lib/auth', () => ({ auth: async () => mockUserId ? { user: { id: mockUserId } } : null }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn() }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: jest.fn(), getExperimentVariants: async () => ({}) }))
jest.mock('@/lib/analytics/track-event', () => ({ trackEvent: async () => {} }))
jest.mock('@/lib/analytics/first-touch', () => ({ stampFirstTouch: async () => {} }))

const gateway = jest.fn()
const address = { name: 'Checkout Customer', line1: 'Test lane', city: 'Delhi', state: 'Delhi', postalCode: '110001' }
let buyerId = '', otherId = '', productId = ''
let key = ''

function request(body: unknown) {
  return new Request('http://localhost/api/store/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function purchase(extra = {}) { return { checkoutKey: key, items: [{ productId, quantity: 2 }], shippingAddress: address, ...extra } }

beforeEach(async () => {
  jest.clearAllMocks()
  key = randomUUID()
  buyerId = (await prisma.user.create({ data: { email: `checkout-${randomUUID()}@example.test` } })).id
  otherId = (await prisma.user.create({ data: { email: `checkout-other-${randomUUID()}@example.test` } })).id
  productId = (await prisma.product.create({ data: { slug: `checkout-${randomUUID()}`, title: 'Practice mat', pricePaise: 12000, stockCount: 10 } })).id
  mockUserId = buyerId
  gateway.mockReset().mockImplementation(async () => ({ id: `order_${randomUUID()}` }))
  jest.mocked(getRazorpayClient).mockResolvedValue({ orders: { create: gateway } } as never)
  jest.mocked(getSessionId).mockResolvedValue(null as never)
})
afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [buyerId, otherId] } } })
  await prisma.product.delete({ where: { id: productId } })
})
afterAll(() => prisma.$disconnect())

test('gateway downtime preserves one purchase and recovery keeps the saved price and pending payment', async () => {
  jest.mocked(getRazorpayClient).mockResolvedValueOnce(null)
  const failed = await checkout(request(purchase()))
  expect(failed.status).toBe(500)
  const failedBody = await failed.json()
  expect(failedBody).toMatchObject({ error: 'Payment gateway unavailable', orderId: expect.any(String) })
  await prisma.product.update({ where: { id: productId }, data: { pricePaise: 18000 } })
  const retry = await checkout(request(purchase()))
  const recovered = await retry.json()
  expect(retry.status).toBe(200)
  expect(recovered).toMatchObject({ orderId: failedBody.orderId, amountPaise: 24000, resumed: true })
  expect(await (await checkout(request(purchase()))).json()).toEqual(recovered)
  expect(gateway).toHaveBeenCalledTimes(1)
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(1)
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(1)
  expect(await prisma.orderItem.findMany({ where: { orderId: recovered.orderId } })).toEqual([expect.objectContaining({ quantity: 2, pricePaise: 24000 })])
})

test('concurrent requests return one saved order and one usable pending payment', async () => {
  let arrivals = 0
  let release!: () => void
  const bothAtGateway = new Promise<void>(resolve => { release = resolve })
  gateway.mockImplementation(async () => { if (++arrivals === 2) release(); await bothAtGateway; return { id: `order_${randomUUID()}` } })
  const responses = await Promise.all([checkout(request(purchase())), checkout(request(purchase()))])
  expect(responses.map(response => response.status)).toEqual([200, 200])
  const [first, second] = await Promise.all(responses.map(response => response.json()))
  expect(second).toMatchObject({ orderId: first.orderId, razorpayOrderId: first.razorpayOrderId })
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(1)
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(1)
  expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(10)
})

test('lost response can be replayed, equivalent cart lines coalesce, and changed details cannot overwrite a quote', async () => {
  const first = await (await checkout(request(purchase({ items: [{ productId, quantity: 1 }, { productId, quantity: 1 }] })))).json()
  const replay = await (await checkout(request(purchase()))).json()
  expect(replay).toMatchObject({ orderId: first.orderId, razorpayOrderId: first.razorpayOrderId })
  expect((await checkout(request(purchase({ shippingAddress: { ...address, city: 'Mumbai' } })))).status).toBe(409)
  expect((await checkout(request(purchase({ items: [{ productId, quantity: 3 }] })))).status).toBe(409)
  expect(gateway).toHaveBeenCalledTimes(1)
  expect((await prisma.order.findUniqueOrThrow({ where: { id: first.orderId } })).shippingAddress).toEqual(address)
  expect((await checkout(request(purchase({ checkoutKey: randomUUID() })))).status).toBe(200)
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(2)
})

test('retry keys are scoped to the owner and cannot reveal or pay another customer’s order', async () => {
  const first = await (await checkout(request(purchase()))).json()
  mockUserId = otherId
  const other = await (await checkout(request(purchase()))).json()
  expect(other.orderId).not.toBe(first.orderId)
  expect((await createPayment(request({ type: 'STORE', metadata: { orderId: first.orderId } }))).status).toBe(403)
  expect(await prisma.order.count({ where: { checkoutKey: key } })).toBe(2)
})

test.each(['paid', 'shipped', 'delivered', 'cancelled'])('a %s purchase returns its saved reference without opening another payment', async status => {
  const first = await (await checkout(request(purchase()))).json()
  await prisma.order.update({ where: { id: first.orderId }, data: { status } })
  const replay = await checkout(request(purchase()))
  expect(replay.status).toBe(409)
  expect(await replay.json()).toMatchObject({ orderId: first.orderId, error: 'Order is not awaiting payment' })
  expect(gateway).toHaveBeenCalledTimes(1)
})

test('legacy requests without a retry key still work and nullable keys do not collide', async () => {
  const legacy = purchase({ checkoutKey: undefined })
  const first = await (await checkout(request(legacy))).json()
  const second = await (await checkout(request(legacy))).json()
  expect(first.orderId).not.toBe(second.orderId)
  expect(await prisma.order.count({ where: { userId: buyerId, checkoutKey: null } })).toBe(2)
})

test('rejects invalid keys, combined quantities, whitespace addresses, insufficient stock and integer overflow before saving', async () => {
  for (const input of [purchase({ checkoutKey: 'invalid' }), purchase({ items: [{ productId, quantity: 60 }, { productId, quantity: 60 }] }), purchase({ shippingAddress: { ...address, city: '  ' } }), purchase({ items: [{ productId, quantity: 11 }] })]) {
    expect((await checkout(request(input))).status).toBe(400)
  }
  await prisma.product.update({ where: { id: productId }, data: { pricePaise: 2147483647 } })
  expect((await checkout(request(purchase()))).status).toBe(400)
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(0)
  expect(gateway).not.toHaveBeenCalled()
})

test('stale sessions for a closed account and anonymous requests cannot create purchases', async () => {
  await prisma.user.update({ where: { id: buyerId }, data: { closedAt: new Date() } })
  expect((await checkout(request(purchase()))).status).toBe(401)
  mockUserId = undefined
  expect((await checkout(request(purchase()))).status).toBe(401)
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(0)
})

test('analytics failure cannot hide a prepared payment', async () => {
  jest.mocked(getSessionId).mockRejectedValueOnce(new Error('request cookies unavailable'))
  expect((await checkout(request(purchase()))).status).toBe(200)
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(1)
})

test('a missing gateway confirmation can recover without another saved order', async () => {
  gateway.mockResolvedValueOnce({})
  const failed = await checkout(request(purchase()))
  expect(failed.status).toBe(500)
  const saved = await failed.json()
  const retry = await checkout(request(purchase()))
  expect(retry.status).toBe(200)
  expect(await retry.json()).toMatchObject({ orderId: saved.orderId, resumed: true })
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(1)
})

test('a failed payment write rolls back and a retry recovers the saved purchase', async () => {
  const constraint = `qa_checkout_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "Payment" ADD CONSTRAINT "${constraint}" CHECK ("userId" <> '${buyerId}') NOT VALID`)
  let savedId = ''
  try {
    const failed = await checkout(request(purchase()))
    expect(failed.status).toBe(500)
    savedId = (await failed.json()).orderId
    expect(savedId).toBeTruthy()
    expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(0)
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Payment" DROP CONSTRAINT "${constraint}"`)
  }
  const recovered = await checkout(request(purchase()))
  expect(recovered.status).toBe(200)
  expect(await recovered.json()).toMatchObject({ orderId: savedId, resumed: true })
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(1)
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(1)
})

test('the exact migration preserves legacy orders and allows repeated null checkout keys', async () => {
  const sql = readFileSync('prisma/migrations/20261107010000_store_checkout_recovery/migration.sql', 'utf8')
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`CREATE TEMP TABLE "Order" (id text PRIMARY KEY, "userId" text, "totalPaise" integer) ON COMMIT DROP`
    await tx.$executeRaw`INSERT INTO "Order" VALUES ('legacy-one', 'buyer', 123), ('legacy-two', 'buyer', 456)`
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    expect(await tx.$queryRaw`SELECT * FROM "Order" ORDER BY id`).toEqual([
      { id: 'legacy-one', userId: 'buyer', totalPaise: 123, checkoutKey: null },
      { id: 'legacy-two', userId: 'buyer', totalPaise: 456, checkoutKey: null },
    ])
  })
})

test.each([
  { isActive: false },
  { stockStatus: 'OUT' },
  { stockCount: 0 },
  { stockCount: 1 },
])('both checkout paths block an unavailable saved purchase and recover the original quote (%j)', async unavailable => {
  const first = await (await checkout(request(purchase()))).json()
  const before = await prisma.order.findUniqueOrThrow({ where: { id: first.orderId }, include: { items: true } })
  const payments = await prisma.payment.findMany({ where: { userId: buyerId } })
  await prisma.product.update({ where: { id: productId }, data: unavailable })
  const retry = await checkout(request(purchase()))
  expect(retry.status).toBe(409)
  expect(await retry.json()).toMatchObject({ orderId: first.orderId, error: expect.stringContaining('currently unavailable') })
  const generic = await createPayment(request({ type: 'STORE', metadata: { orderId: first.orderId } }))
  expect(generic.status).toBe(409)
  expect(await prisma.order.findUniqueOrThrow({ where: { id: first.orderId }, include: { items: true } })).toEqual(before)
  expect(await prisma.payment.findMany({ where: { userId: buyerId } })).toEqual(payments)
  expect(gateway).toHaveBeenCalledTimes(1)
  await prisma.product.update({ where: { id: productId }, data: { isActive: true, stockStatus: 'IN_STOCK', stockCount: 10, pricePaise: 40000 } })
  const restored = await createPayment(request({ type: 'STORE', metadata: { orderId: first.orderId } }))
  expect(restored.status).toBe(200)
  expect(await restored.json()).toMatchObject({ orderId: first.razorpayOrderId, amountPaise: 24000 })
  expect(gateway).toHaveBeenCalledTimes(1)
  expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(10)
})

test('empty historical orders need review before a new payment can be offered', async () => {
  const order = await prisma.order.create({ data: { userId: buyerId, totalPaise: 1000 } })
  const response = await createPayment(request({ type: 'STORE', metadata: { orderId: order.id } }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Order items need review before payment' })
  expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order)
  expect(gateway).not.toHaveBeenCalled()
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(0)
})

test('duplicate legacy lines share their total stock requirement without rewriting saved prices', async () => {
  const order = await prisma.order.create({ data: { userId: buyerId, totalPaise: 48000, items: { create: [
    { productId, quantity: 2, pricePaise: 24000 }, { productId, quantity: 2, pricePaise: 24000 },
  ] } } })
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 3 } })
  expect((await createPayment(request({ type: 'STORE', metadata: { orderId: order.id } }))).status).toBe(409)
  expect(gateway).not.toHaveBeenCalled()
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 4, pricePaise: 40000 } })
  const response = await createPayment(request({ type: 'STORE', metadata: { orderId: order.id } }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ amountPaise: 48000 })
  expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(4)
  expect(await prisma.orderItem.count({ where: { orderId: order.id, quantity: 2, pricePaise: 24000 } })).toBe(2)
})

test('rechecks availability after gateway I/O without holding product locks during the external call', async () => {
  gateway.mockImplementationOnce(async () => {
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } })
    return { id: `order_${randomUUID()}` }
  })
  const response = await checkout(request(purchase()))
  expect(response.status).toBe(409)
  const saved = await response.json()
  expect(saved.orderId).toBeTruthy()
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(0)
  expect(await prisma.order.count({ where: { userId: buyerId } })).toBe(1)
  await prisma.product.update({ where: { id: productId }, data: { isActive: true, pricePaise: 40000 } })
  const retry = await checkout(request(purchase()))
  expect(retry.status).toBe(200)
  expect(await retry.json()).toMatchObject({ orderId: saved.orderId, amountPaise: 24000, resumed: true })
  expect(await prisma.payment.count({ where: { userId: buyerId } })).toBe(1)
})
