import { GET, DELETE } from '@/app/api/users/account/route'
import { AccountClosureError, accountClosureStatus, closeOwnAccount } from '@/lib/users/account-closure'

const mockProof = { issuedAt: 123, proof: 'signed-session-only' }
let mockActor: string | null = 'owner'
jest.mock('@/lib/auth', () => ({ auth: async () => mockActor ? { user: { id: mockActor, recentAuthentication: mockProof } } : null }))
jest.mock('@/lib/users/account-closure', () => ({ ...jest.requireActual('@/lib/users/account-closure'), accountClosureStatus: jest.fn(), closeOwnAccount: jest.fn() }))
const body = { ownerId: 'owner', reviewVersion: 'a'.repeat(64), acknowledged: true, confirmation: 'CLOSE MY ACCOUNT' }
const snapshot = { ownerId: 'owner', reviewVersion: body.reviewVersion, blockers: [], reauthenticate: true, expiresAt: null }
const request = (data: unknown, headers = {}) => new Request('https://example.test/api/users/account', { method: 'DELETE', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) })
beforeEach(() => {
  jest.clearAllMocks(); mockActor = 'owner'
  jest.mocked(accountClosureStatus).mockResolvedValue(snapshot)
  jest.mocked(closeOwnAccount).mockResolvedValue({ ownerId: 'owner', closed: true, closedAt: new Date().toISOString() })
})
afterEach(() => jest.restoreAllMocks())
test('private status and confirmation use only the current signed-in owner and server session proof', async () => {
  const review = await GET()
  expect(review.headers.get('cache-control')).toBe('private, no-store')
  expect(await review.json()).toEqual(snapshot)
  expect(accountClosureStatus).toHaveBeenCalledWith('owner', mockProof)
  const closed = await DELETE(request(body))
  expect(closed.status).toBe(200)
  expect(closed.headers.get('cache-control')).toBe('private, no-store')
  expect(closed.headers.get('set-cookie')).toBeNull()
  expect(closeOwnAccount).toHaveBeenCalledWith('owner', body.reviewVersion, mockProof)
})
test('anonymous and changed-owner requests cannot reach account closure', async () => {
  mockActor = null
  expect((await GET()).status).toBe(401)
  expect((await DELETE(request(body))).status).toBe(401)
  mockActor = 'another'
  expect((await DELETE(request(body))).status).toBe(409)
  expect(closeOwnAccount).not.toHaveBeenCalled()
})
test.each([{ ...body, acknowledged: false }, { ...body, confirmation: 'close' }, { ...body, reviewVersion: 'bad' }, { ...body, recentAuthentication: mockProof }, [], null])('strict review and explicit confirmation reject invalid/forged data (%#)', async input => {
  expect((await DELETE(request(input))).status).toBe(400)
  expect(closeOwnAccount).not.toHaveBeenCalled()
})
test('cross-site, non-JSON and malformed JSON writes are refused before side effects', async () => {
  expect((await DELETE(request(body, { origin: 'https://other.test' }))).status).toBe(403)
  expect((await DELETE(request(body, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
  expect((await DELETE(request(body, { 'content-type': 'text/plain' }))).status).toBe(415)
  expect((await DELETE(new Request('https://example.test/api/users/account', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{' }))).status).toBe(400)
  expect(closeOwnAccount).not.toHaveBeenCalled()
})
test.each([[403, 'REAUTHENTICATE'], [409, 'ACCOUNT_CHANGED'], [409, 'ACCOUNT_IN_USE'], [401, 'UNAUTHORIZED']] as const)('safe domain errors preserve status and private headers (%s)', async (status, code) => {
  jest.mocked(closeOwnAccount).mockRejectedValue(new AccountClosureError('Review required.', status, code))
  const response = await DELETE(request(body))
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ error: 'Review required.', code })
})
test('unknown errors do not expose private account details or claim closure', async () => {
  jest.mocked(closeOwnAccount).mockRejectedValue(new Error('private-account-credential'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const response = await DELETE(request(body))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Unable to manage account closure. Refresh the review before trying again.' })
  expect(log).toHaveBeenCalledWith('[users][account][error]')
})
