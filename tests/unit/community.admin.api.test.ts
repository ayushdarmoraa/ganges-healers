import { NextRequest } from 'next/server'
import { GET, PATCH } from '@/app/api/admin/community/route'
import { POST } from '@/app/api/community/reports/route'
import { CommunityModerationError } from '@/lib/community/moderation'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/community/admin', () => ({ requireCommunityAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/community/moderation', () => ({
  ...jest.requireActual('@/lib/community/moderation'), moderateCommunity: jest.fn(), submitCommunityReport: jest.fn(),
}))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const admin = jest.requireMock<{ requireCommunityAdmin: jest.Mock }>('@/lib/community/admin').requireCommunityAdmin
const domain = jest.requireMock<{ moderateCommunity: jest.Mock; submitCommunityReport: jest.Mock }>('@/lib/community/moderation')
const request = (body: unknown, method = 'PATCH') => new NextRequest('http://localhost/api/admin/community', { method, body: typeof body === 'string' ? body : JSON.stringify(body) })
beforeEach(() => {
  jest.resetAllMocks()
  admin.mockResolvedValue({ id: 'admin' })
  auth.mockResolvedValue({ user: { id: 'reporter' } })
  domain.moderateCommunity.mockResolvedValue({ data: { id: 'report', status: 'reviewed' }, idempotent: false, resolvedCount: 1 })
  domain.submitCommunityReport.mockResolvedValue({ id: 'report' })
})

test.each(['GET', 'PATCH'])('non-admin %s is rejected before accessing moderation data', async method => {
  admin.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const response = method === 'GET' ? await GET(new NextRequest('http://localhost/api/admin/community')) : await PATCH(request({ action: 'hide', targetType: 'post', targetId: 'post' }))
  expect(response.status).toBe(403)
  expect(domain.moderateCommunity).not.toHaveBeenCalled()
})

test.each(['{', { action: 'erase', targetType: 'post', targetId: 'post' }, { action: 'hide' }, { action: 'hide', targetType: 'post', targetId: 'post', expectedUpdatedAt: 'yesterday' }])('invalid moderation input is rejected: %p', async body => {
  expect((await PATCH(request(body))).status).toBe(400)
  expect(domain.moderateCommunity).not.toHaveBeenCalled()
})

test('legacy reviewed action retains its data envelope and uses the authenticated actor', async () => {
  const response = await PATCH(request({ action: 'reviewed', reportId: 'report', actorId: 'spoofed' }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, data: { id: 'report', status: 'reviewed' } })
  expect(domain.moderateCommunity).toHaveBeenCalledWith({ action: 'reviewed', reportId: 'report', actorId: 'admin' })
})

test('a conflict is reported as a conflict rather than a successful decision', async () => {
  domain.moderateCommunity.mockRejectedValue(new CommunityModerationError('Refresh the queue', 409))
  const response = await PATCH(request({ action: 'hide', targetType: 'post', targetId: 'post' }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Refresh the queue' })
})

test('report submission uses the signed-in identity and trims the reason', async () => {
  const response = await POST(request({ targetType: 'post', targetId: 'post', actorId: 'spoofed', reason: '  Please review this  ' }, 'POST'))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ success: true, data: { id: 'report' } })
  expect(domain.submitCommunityReport).toHaveBeenCalledWith({ targetType: 'post', targetId: 'post', actorId: 'reporter', reason: 'Please review this' })
})

test('signed-out report submission and whitespace reasons cannot write', async () => {
  expect((await POST(request({ targetType: 'post', targetId: 'post', reason: '     ' }, 'POST'))).status).toBe(400)
  auth.mockResolvedValue(null)
  expect((await POST(request({ targetType: 'post', targetId: 'post', reason: 'A reason' }, 'POST'))).status).toBe(401)
  expect(domain.submitCommunityReport).not.toHaveBeenCalled()
})
