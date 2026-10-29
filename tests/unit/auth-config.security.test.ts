jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })),
}))
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((configuration: unknown) => configuration),
}))
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), create: jest.fn() } } }))
jest.mock('bcryptjs', () => ({ __esModule: true, default: { compare: jest.fn() } }))

interface AuthConfiguration {
  secret?: string
  providers: Array<{
    id: string
    authorize: (credentials: Record<string, string>) => Promise<Record<string, unknown> | null>
  }>
}

function loadConfiguration(): {
  configuration: AuthConfiguration
  user: { findUnique: jest.Mock; create: jest.Mock }
  compare: jest.Mock
} {
  let result: ReturnType<typeof loadConfiguration> | undefined
  jest.isolateModules(() => {
    jest.requireActual('@/lib/auth')
    const nextAuth = jest.requireMock<{ default: jest.Mock }>('next-auth').default
    const prisma = jest.requireMock<{ prisma: { user: { findUnique: jest.Mock; create: jest.Mock } } }>('@/lib/prisma').prisma
    const bcrypt = jest.requireMock<{ default: { compare: jest.Mock } }>('bcryptjs').default
    result = { configuration: nextAuth.mock.calls[0][0], user: prisma.user, compare: bcrypt.compare }
  })
  if (!result) throw new Error('Auth configuration was not loaded')
  return result
}

describe('production-safe authentication configuration', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test' })
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.TEST_MODE
    delete process.env.NEXT_PUBLIC_TEST_MODE
    jest.clearAllMocks()
  })
  afterEach(() => jest.restoreAllMocks())

  test('does not register a demo fallback provider when Google is absent', () => {
    const { configuration } = loadConfiguration()
    expect(configuration.providers.map(provider => provider.id)).toEqual(['credentials'])
  })

  test('a known demo email/password does not bypass the stored password hash', async () => {
    const { configuration, user, compare } = loadConfiguration()
    user.findUnique.mockResolvedValue({ id: 'existing-user', email: 'test@example.com', password: 'stored-hash' })
    compare.mockResolvedValue(false)
    await expect(configuration.providers[0].authorize({ email: 'test@example.com', password: 'demo123' })).resolves.toBeNull()
    expect(compare).toHaveBeenCalledWith('demo123', 'stored-hash')
    expect(user.create).not.toHaveBeenCalled()
  })

  test('preserves successful login with a verified database password', async () => {
    const { configuration, user, compare } = loadConfiguration()
    user.findUnique.mockResolvedValue({ id: 'registered-user', email: 'registered@example.com', password: 'stored-hash', name: 'Registered', role: 'USER', vip: false, freeSessionCredits: 0 })
    compare.mockResolvedValue(true)
    await expect(configuration.providers[0].authorize({ email: 'registered@example.com', password: 'correct-password' })).resolves.toMatchObject({ id: 'registered-user', role: 'USER' })
    expect(user.create).not.toHaveBeenCalled()
  })

  test('requires a configured production secret rather than a public fallback', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production')
    delete process.env.AUTH_SECRET
    delete process.env.NEXTAUTH_SECRET
    expect(() => loadConfiguration()).toThrow('required for production authentication')
  })

  test('rejects test flags even if authentication is imported without startup instrumentation', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production')
    process.env.TEST_MODE = '1'
    expect(() => loadConfiguration()).toThrow('must be disabled')
  })
})
