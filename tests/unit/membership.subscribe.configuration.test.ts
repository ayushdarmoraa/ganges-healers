import Razorpay from 'razorpay'
import { POST } from '@/app/api/memberships/subscribe/route'

jest.mock('razorpay', () => jest.fn(() => {
  throw new Error('Razorpay must not be constructed while importing the route')
}))
jest.mock('@/lib/prisma', () => ({ prisma: { membershipPlan: { findUnique: jest.fn() } } }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn() }))

const findPlan = jest.requireMock<{ prisma: { membershipPlan: { findUnique: jest.Mock } } }>('@/lib/prisma').prisma.membershipPlan.findUnique
const getGateway = jest.requireMock<{ getRazorpayClient: jest.Mock }>('@/lib/razorpay').getRazorpayClient
const createSubscription = jest.fn()
const fetchPlan = jest.fn()

function request(body: unknown, query = '') {
  return new Request(`http://localhost/api/memberships/subscribe${query}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  findPlan.mockResolvedValue({ razorpayPlanId: 'plan_monthly' })
  getGateway.mockResolvedValue(null)
})
afterEach(() => jest.restoreAllMocks())

test('route imports without constructing the payment SDK', () => {
  expect(Razorpay).not.toHaveBeenCalled()
  expect(getGateway).not.toHaveBeenCalled()
})

test('dry run resolves the canonical plan without requiring payment credentials', async () => {
  const response = await POST(request({ planSlug: 'monthly' }, '?dry=1'))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ marker: 'SUBSCRIBE_V3', canonical: 'vip-monthly', planId: 'plan_monthly', dry: true })
  expect(getGateway).not.toHaveBeenCalled()
  expect(createSubscription).not.toHaveBeenCalled()
})

test('missing payment credentials use the existing controlled failure response', async () => {
  const response = await POST(request({ planSlug: 'vip-monthly' }))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Subscription initiation failed', errorDetail: 'Razorpay client not configured' })
  expect(createSubscription).not.toHaveBeenCalled()
})

test('configured subscriptions retain the gateway request and success response', async () => {
  getGateway.mockResolvedValue({ subscriptions: { create: createSubscription } })
  createSubscription.mockResolvedValue({ id: 'sub_monthly', short_url: 'https://rzp.io/i/example' })
  const response = await POST(request({ planSlug: 'vip-monthly' }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ id: 'sub_monthly', shortUrl: 'https://rzp.io/i/example' })
  expect(createSubscription).toHaveBeenCalledWith({ plan_id: 'plan_monthly', total_count: 1, customer_notify: 1 })
})

test('diagnostics fetch the configured plan without opening a subscription', async () => {
  getGateway.mockResolvedValue({ plans: { fetch: fetchPlan }, subscriptions: { create: createSubscription } })
  fetchPlan.mockResolvedValue({ period: 'monthly', item: { name: 'VIP Monthly' } })
  const response = await POST(request({ planSlug: 'monthly' }, '?diag=1'))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ diagnostic: 'plan_fetch_ok', planId: 'plan_monthly', interval: 'monthly', item: 'VIP Monthly' })
  expect(fetchPlan).toHaveBeenCalledWith('plan_monthly')
  expect(createSubscription).not.toHaveBeenCalled()
})

test('unknown plans retain their validation response without contacting the gateway', async () => {
  const response = await POST(request({ planSlug: 'vip-weekly' }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'unknown-plan', planSlug: 'vip-weekly', canonical: null })
  expect(findPlan).not.toHaveBeenCalled()
  expect(getGateway).not.toHaveBeenCalled()
})

test('plans without a gateway ID fail before constructing a payment client', async () => {
  findPlan.mockResolvedValue({ razorpayPlanId: null })
  const response = await POST(request({ planSlug: 'monthly' }))
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: 'Unknown or unconfigured plan', canonical: 'vip-monthly', planId: null })
  expect(getGateway).not.toHaveBeenCalled()
})
