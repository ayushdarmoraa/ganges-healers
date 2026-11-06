import { GET, POST } from '@/app/api/users/me/phone-verification/route'
import { confirmPhoneVerification, PhoneVerificationError, phoneVerificationStatus, requestPhoneVerification } from '@/lib/auth/phone-verification'

let mockUser: string | null = 'owner'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUser ? { user: { id: mockUser } } : null }))
jest.mock('@/lib/auth/phone-verification', () => ({ ...jest.requireActual('@/lib/auth/phone-verification'), phoneVerificationStatus: jest.fn(), requestPhoneVerification: jest.fn(), confirmPhoneVerification: jest.fn() }))
const phone = '+15555550101', id = 'b780d2eb-bcd2-4b69-afd5-e3d35b04dc2d'
const snapshot = { ownerId: 'owner', phone, verifiedAt: null, canVerify: true, available: true, retryAt: null, challenge: { id, expiresAt: new Date(Date.now() + 600_000).toISOString() } }
const send = { action: 'request', ownerId: 'owner', phone, consent: true }
function request(body: unknown, headers = {}) { return new Request('https://example.test/api/users/me/phone-verification', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }) }
beforeEach(() => {
  jest.clearAllMocks(); mockUser = 'owner'
  jest.mocked(phoneVerificationStatus).mockResolvedValue(snapshot)
  jest.mocked(requestPhoneVerification).mockResolvedValue(snapshot)
  jest.mocked(confirmPhoneVerification).mockResolvedValue({ ...snapshot, verifiedAt: new Date().toISOString(), challenge: null })
})
afterEach(() => jest.restoreAllMocks())
test('status is current-owner-only and private/no-store', async () => {
  const response = await GET()
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual(snapshot)
  expect(phoneVerificationStatus).toHaveBeenCalledWith('owner')
})
test('anonymous requests and stale owners cannot start or confirm verification', async () => {
  mockUser = null
  expect((await GET()).status).toBe(401)
  expect((await POST(request(send))).status).toBe(401)
  mockUser = 'another'
  expect((await POST(request(send))).status).toBe(409)
  expect(requestPhoneVerification).not.toHaveBeenCalled(); expect(confirmPhoneVerification).not.toHaveBeenCalled()
})
test.each([{ ...send, consent: false }, { ...send, consent: undefined }, { ...send, phone: '9876543210' }, { ...send, recipient: '+15555550102' }, { action: 'confirm', ownerId: 'owner', phone, challengeId: id, code: '123' }])('invalid snapshots, extra recipients and absent consent are refused %j', async body => {
  expect((await POST(request(body))).status).toBe(400)
  expect(requestPhoneVerification).not.toHaveBeenCalled(); expect(confirmPhoneVerification).not.toHaveBeenCalled()
})
test('a send acknowledgement remains pending; only confirmed approval returns verified', async () => {
  expect(await (await POST(request(send))).json()).toMatchObject({ status: 'pending', verifiedAt: null })
  const confirmed = await POST(request({ action: 'confirm', ownerId: 'owner', phone, challengeId: id, code: '123456' }))
  expect(await confirmed.json()).toMatchObject({ status: 'verified', verifiedAt: expect.any(String) })
  expect(confirmed.headers.get('set-cookie')).toBeNull()
  expect(confirmPhoneVerification).toHaveBeenCalledWith('owner', phone, id, '123456')
})
test('cross-site and non-JSON writes cannot reach the verification service', async () => {
  expect((await POST(request(send, { origin: 'https://other.test' }))).status).toBe(403)
  expect((await POST(request(send, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
  expect((await POST(request(send, { 'content-type': 'text/plain' }))).status).toBe(415)
  expect(requestPhoneVerification).not.toHaveBeenCalled()
})
test('shared throttling returns a usable Retry-After without leaking stored state', async () => {
  jest.mocked(requestPhoneVerification).mockRejectedValue(new PhoneVerificationError('Please wait.', 429, 'RATE_LIMIT', 60))
  const response = await POST(request(send))
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60')
  expect(await response.json()).toEqual({ error: 'Please wait.', code: 'RATE_LIMIT' })
})
test('unavailable SMS is truthful and unknown failures never expose their private exception', async () => {
  jest.mocked(requestPhoneVerification).mockRejectedValueOnce(new PhoneVerificationError('SMS unavailable', 503, 'SMS_UNAVAILABLE')).mockRejectedValueOnce(new Error('private-code-and-phone'))
  expect((await POST(request(send))).status).toBe(503)
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const response = await POST(request(send))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Unable to manage phone verification. Please try again.' })
  expect(log).toHaveBeenCalledWith('[auth][phone-verification][error]')
})
