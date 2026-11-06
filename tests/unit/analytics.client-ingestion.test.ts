import { POST } from '@/app/api/events/track/route'
import { auth } from '@/lib/auth'
import { trackEvent } from '@/lib/analytics/track-event'
import { getSessionId, getExperimentVariants } from '@/lib/analytics/session'
import { stampFirstTouch } from '@/lib/analytics/first-touch'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/analytics/track-event', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: jest.fn(), getExperimentVariants: jest.fn() }))
jest.mock('@/lib/analytics/first-touch', () => ({ stampFirstTouch: jest.fn() }))
function request(body: string) { return new Request('http://localhost/api/events/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body }) }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(auth).mockResolvedValue({ user: { id: 'owner', email: 'owner@example.test' } } as never)
  jest.mocked(getSessionId).mockResolvedValue('session-id')
  jest.mocked(getExperimentVariants).mockResolvedValue({ experiment: 'variant' })
  jest.mocked(trackEvent).mockResolvedValue(undefined)
  jest.mocked(stampFirstTouch).mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

test.each(['', '{', 'null', '[]', '"product_view"', '42'])('malformed or non-object request %j is a validation error without analytics/account side effects', async input => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const response = await POST(request(input))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'Invalid event payload' })
  expect(getSessionId).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled()
  expect(trackEvent).not.toHaveBeenCalled(); expect(stampFirstTouch).not.toHaveBeenCalled()
  expect(log).not.toHaveBeenCalled()
})
test.each(['purchase', 'checkout_start', 'unknown', null])('invalid or server-only event %j retains its existing error and cannot write', async type => {
  const response = await POST(request(JSON.stringify({ type })))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'Invalid event type' })
  expect(trackEvent).not.toHaveBeenCalled(); expect(getSessionId).not.toHaveBeenCalled()
})
test.each([{ email: 42 }, { email: { address: 'wrong-shape@example.test' } }, { metadata: [] }, { metadata: 'wrong shape' }])('invalid optional payload fields %j cannot enter the analytics writer', async extra => {
  expect((await POST(request(JSON.stringify({ type: 'product_view', ...extra })))).status).toBe(400)
  expect(trackEvent).not.toHaveBeenCalled(); expect(getSessionId).not.toHaveBeenCalled()
})
test('a valid event retains cookie attribution, current account, metadata and first-touch behavior', async () => {
  const response = await POST(request(JSON.stringify({ type: 'product_view', source: 'store', chakra: 'heart', metadata: { productId: 'product' } })))
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true })
  expect(trackEvent).toHaveBeenCalledWith({ type: 'product_view', userId: 'owner', email: 'owner@example.test', sessionId: 'session-id', experimentVariant: 'experiment:variant', source: 'store', chakra: 'heart', metadata: { productId: 'product' } })
  expect(stampFirstTouch).toHaveBeenCalledWith('owner', 'store', 'experiment:variant')
})
test('anonymous valid events still get a nonempty session and no first-touch account write', async () => {
  jest.mocked(auth).mockResolvedValue(null as never)
  jest.mocked(getSessionId).mockResolvedValue(null)
  jest.mocked(getExperimentVariants).mockResolvedValue({})
  expect((await POST(request(JSON.stringify({ type: 'add_to_cart', email: 'lead@example.test' })))).status).toBe(200)
  expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'add_to_cart', userId: null, email: 'lead@example.test', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), experimentVariant: null }))
  expect(stampFirstTouch).not.toHaveBeenCalled()
})
