import { isTestMode, assertProductionTestModeDisabled } from '@/lib/test-mode'
import { requireAdmin } from '@/lib/rbac'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

describe('server test-mode policy', () => {
  beforeEach(() => jest.clearAllMocks())
  afterEach(() => jest.restoreAllMocks())

  test.each(['development', 'test'])('allows an explicit private flag in %s', NODE_ENV => {
    expect(isTestMode({ NODE_ENV, TEST_MODE: '1' })).toBe(true)
  })

  test.each(['production', 'staging', undefined])('refuses shortcuts in %s', NODE_ENV => {
    expect(isTestMode({ NODE_ENV, TEST_MODE: '1', NEXT_PUBLIC_TEST_MODE: '1' })).toBe(false)
  })

  test('never authorizes a server shortcut using only the public flag', () => {
    expect(isTestMode({ NODE_ENV: 'test', NEXT_PUBLIC_TEST_MODE: '1' })).toBe(false)
  })

  test.each(['TEST_MODE', 'NEXT_PUBLIC_TEST_MODE'])('rejects production startup with %s', flag => {
    expect(() => assertProductionTestModeDisabled({ NODE_ENV: 'production', [flag]: '1' })).toThrow('must be disabled')
  })

  test('accepts production startup with shortcuts disabled', () => {
    expect(() => assertProductionTestModeDisabled({ NODE_ENV: 'production', TEST_MODE: '0' })).not.toThrow()
  })

  test('an accidental production test flag cannot bypass the admin guard', async () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'production', TEST_MODE: '1' })
    const mockAuth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
    mockAuth.mockResolvedValue({ user: { id: 'normal-user', role: 'USER' } })
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 })
    expect(mockAuth).toHaveBeenCalled()
  })

  test('preserves normal admin authorization in production', async () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'production', TEST_MODE: '0' })
    const session = { user: { id: 'real-admin', role: 'ADMIN' } }
    jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth.mockResolvedValue(session)
    await expect(requireAdmin()).resolves.toBe(session)
  })

  test('retains explicit development-only admin bypass for E2E', async () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development', TEST_MODE: '1' })
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: 'ADMIN' } })
    expect(jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth).not.toHaveBeenCalled()
  })
})
