jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })),
}))
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((configuration: unknown) => configuration),
}))
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: jest.fn() }))
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn((configuration: Record<string, unknown>) => ({ id: 'google', ...configuration })),
}))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), create: jest.fn() } } }))
jest.mock('bcryptjs', () => ({ __esModule: true, default: { compare: jest.fn() } }))

interface AuthConfiguration {
  secret?: string
  callbacks: { jwt: (input: { token: Record<string, unknown>; trigger: string; session?: unknown }) => Promise<Record<string, unknown> | null>; signIn: (input: { account?: { provider: string }; profile?: { email_verified?: boolean } }) => Promise<boolean> }
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
    delete process.env.AUTH_GOOGLE_ID
    delete process.env.AUTH_GOOGLE_SECRET
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

  test.each([
    ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'],
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ])('enables Google only with a configured %s/%s pair', (id, secret) => {
    process.env[id] = 'configured-client'
    process.env[secret] = 'configured-secret'
    expect(loadConfiguration().configuration.providers.map(provider => provider.id)).toEqual(['credentials', 'google'])
  })

  test('does not enable Google for incomplete credentials', () => {
    process.env.AUTH_GOOGLE_ID = 'configured-client'
    expect(loadConfiguration().configuration.providers.map(provider => provider.id)).toEqual(['credentials'])
  })

  test('requires Google to verify the email before accepting its identity', async () => {
    const { configuration } = loadConfiguration()
    await expect(configuration.callbacks.signIn({ account: { provider: 'google' }, profile: { email_verified: true } })).resolves.toBe(true)
    await expect(configuration.callbacks.signIn({ account: { provider: 'google' }, profile: { email_verified: false } })).resolves.toBe(false)
    await expect(configuration.callbacks.signIn({ account: { provider: 'google' } })).resolves.toBe(false)
    await expect(configuration.callbacks.signIn({ account: { provider: 'credentials' } })).resolves.toBe(true)
  })

  test('preserves successful login with a verified database password', async () => {
    const { configuration, user, compare } = loadConfiguration()
    user.findUnique.mockResolvedValue({ id: 'registered-user', email: 'registered@example.com', password: 'stored-hash', name: 'Registered', role: 'USER', vip: false, freeSessionCredits: 0 })
    compare.mockResolvedValue(true)
    await expect(configuration.providers[0].authorize({ email: 'registered@example.com', password: 'correct-password' })).resolves.toMatchObject({ id: 'registered-user', role: 'USER' })
    expect(user.create).not.toHaveBeenCalled()
  })

  test('refreshes membership claims only from the database when the client requests an update', async () => {
    const { configuration, user } = loadConfiguration()
    user.findUnique.mockResolvedValue({ name: 'Customer', image: null, vip: false, freeSessionCredits: 2, memberships: [] })
    const token = await configuration.callbacks.jwt({ token: { id: 'owner', vip: true, freeSessionCredits: 999 }, trigger: 'update', session: { vip: true, freeSessionCredits: 999 } })
    expect(token).toMatchObject({ id: 'owner', vip: false, freeSessionCredits: 2 })
  })

  test.each([
    ['ADMIN', 'USER'],
    ['HEALER', 'USER'],
    ['USER', 'ADMIN'],
  ])('refreshes a cached %s role to the current database %s role on an ordinary session read', async (cachedRole, currentRole) => {
    const { configuration, user } = loadConfiguration()
    user.findUnique.mockResolvedValue({ name: 'Account', image: null, role: currentRole, vip: false, freeSessionCredits: 0, memberships: [] })
    const token = await configuration.callbacks.jwt({ token: { id: 'account', role: cachedRole }, trigger: '' })
    expect(token).toMatchObject({ id: 'account', role: currentRole })
    expect(user.findUnique).toHaveBeenCalledTimes(1)
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 'account' },
      select: expect.objectContaining({ role: true }),
    })
  })

  test('ignores client-supplied administrator privileges during session updates', async () => {
    const { configuration, user } = loadConfiguration()
    user.findUnique.mockResolvedValue({ name: 'Customer', image: null, role: 'USER', vip: false, freeSessionCredits: 0, memberships: [] })
    await expect(configuration.callbacks.jwt({
      token: { id: 'customer', role: 'USER' }, trigger: 'update',
      session: { role: 'ADMIN', user: { role: 'ADMIN' } },
    })).resolves.toMatchObject({ role: 'USER' })
  })

  test('invalidates a deleted account instead of retaining its cached administrator session', async () => {
    const { configuration, user } = loadConfiguration()
    user.findUnique.mockResolvedValue(null)
    await expect(configuration.callbacks.jwt({ token: { id: 'deleted', role: 'ADMIN', vip: true }, trigger: '' })).resolves.toBeNull()
  })

  test.each([undefined, '', 0])('rejects a session without a valid account ID (%s) before querying users', async id => {
    const { configuration, user } = loadConfiguration()
    await expect(configuration.callbacks.jwt({ token: { id, role: 'ADMIN' }, trigger: '' })).resolves.toBeNull()
    expect(user.findUnique).not.toHaveBeenCalled()
  })

  test('does not retain cached privileges when account verification fails', async () => {
    const { configuration, user } = loadConfiguration()
    user.findUnique.mockRejectedValue(new Error('Account lookup unavailable'))
    await expect(configuration.callbacks.jwt({ token: { id: 'account', role: 'ADMIN' }, trigger: '' })).rejects.toThrow('Account lookup unavailable')
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
