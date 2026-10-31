import { requireCommunityAdmin } from '@/lib/community/admin'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/rbac', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const admin = jest.requireMock<{ requireAdmin: jest.Mock }>('@/lib/rbac').requireAdmin
const user = jest.requireMock<{ prisma: { user: { findUnique: jest.Mock } } }>('@/lib/prisma').prisma.user
beforeEach(() => {
  jest.resetAllMocks()
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', TEST_MODE: '0' })
  admin.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  user.findUnique.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
})
afterEach(() => jest.restoreAllMocks())

test('uses the current database role for moderation access', async () => {
  expect(await requireCommunityAdmin()).toEqual({ id: 'admin', role: 'ADMIN' })
  user.findUnique.mockResolvedValue({ id: 'admin', role: 'USER' })
  await expect(requireCommunityAdmin()).rejects.toMatchObject({ status: 403 })
})

test('rejected sessions do not reach moderation data', async () => {
  admin.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  await expect(requireCommunityAdmin()).rejects.toMatchObject({ status: 403 })
  expect(user.findUnique).not.toHaveBeenCalled()
})

test('test-mode writes resolve to the real signed-in admin for foreign keys and audit', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', TEST_MODE: '1' })
  admin.mockResolvedValue({ user: { id: 'test-admin' } })
  auth.mockResolvedValue({ user: { id: 'actual-admin' } })
  user.findUnique.mockResolvedValue({ id: 'actual-admin', role: 'ADMIN' })
  expect(await requireCommunityAdmin()).toEqual({ id: 'actual-admin', role: 'ADMIN' })
})

test('a synthetic test-mode guard without a real session cannot write', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', TEST_MODE: '1' })
  admin.mockResolvedValue({ user: { id: 'test-admin' } })
  auth.mockResolvedValue(null)
  await expect(requireCommunityAdmin()).rejects.toMatchObject({ status: 403 })
  expect(user.findUnique).not.toHaveBeenCalled()
})
