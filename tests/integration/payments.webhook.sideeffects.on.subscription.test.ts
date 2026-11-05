import crypto from 'node:crypto'
import { POST } from '@/app/api/payments/webhook/route'
import { applyMembershipEvent } from '@/lib/memberships/webhook'
jest.mock('@/lib/memberships/webhook', () => ({ applyMembershipEvent: jest.fn() }))
const apply = jest.mocked(applyMembershipEvent)
const secret = 'whsec_test'
function request(signature?: string) {
  const body = JSON.stringify({ event: 'subscription.activated' })
  return new Request('http://test.local', { method: 'POST', body, headers: { 'x-razorpay-signature': signature ?? crypto.createHmac('sha256', secret).update(body).digest('hex') } })
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.RAZORPAY_WEBHOOK_SECRET = secret
  process.env.PAYMENT_EVENTS_ENABLED = 'true'
})
test('preserves the successful webhook response after membership fulfillment', async () => {
  apply.mockResolvedValue({ applied: true, action: 'subscription.update' })
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(apply).toHaveBeenCalledTimes(1)
})
test('returns 500 after a failed application so Razorpay retries', async () => {
  apply.mockRejectedValue(new Error('temporary database failure'))
  const response = await POST(request())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ ok: false, error: 'apply-error' })
})
test.each(['wrong', 'f'.repeat(64), 'f'.repeat(63)])('rejects invalid signatures before effects (%s)', async signature => {
  expect((await POST(request(signature))).status).toBe(401)
  expect(apply).not.toHaveBeenCalled()
})
