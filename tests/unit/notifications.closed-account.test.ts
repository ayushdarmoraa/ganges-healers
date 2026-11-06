import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { notificationSocketIdentity } from '@/lib/notifications/socket-auth'
import { sessionCredentialVersion } from '@/lib/auth/password-version'

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.replaceProperty(process, 'env', { NODE_ENV: 'test', AUTH_SECRET: 'isolated-socket-secret' })
  jest.mocked(getToken).mockResolvedValue({ id: 'owner', exp: Math.floor(Date.now() / 1000) + 60, passwordVersion: sessionCredentialVersion('stored', 2) } as never)
})
afterEach(() => jest.restoreAllMocks())
test('the ordinary notification transport accepts an open matching account', async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ password: 'stored', securityVersion: 2, closedAt: null } as never)
  expect(await notificationSocketIdentity('authjs.session-token=isolated-cookie')).toMatchObject({ userId: 'owner' })
})
test('a closed account cannot reconnect even with a still-valid token and matching credential version', async () => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ password: 'stored', securityVersion: 2, closedAt: new Date() } as never)
  expect(await notificationSocketIdentity('authjs.session-token=isolated-cookie')).toBeNull()
})
