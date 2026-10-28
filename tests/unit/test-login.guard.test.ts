import { GET } from '@/app/api/test/login/route'
import { encode } from 'next-auth/jwt'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('next-auth/jwt', () => ({
  encode: jest.fn().mockResolvedValue('guard-test-token'),
}))

const { prisma } = jest.requireMock<{
  prisma: {
    user: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
    }
  }
}>('@/lib/prisma')

const originalEnv = process.env
const testUser = {
  id: 'guard-test-user',
  email: 'guard@example.com',
  name: 'Guard Test User',
  role: 'USER',
  vip: false,
  freeSessionCredits: 0,
}

function setEnvironment(nodeEnv: string | undefined, testMode: string | undefined) {
  if (nodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
  else Reflect.set(process.env, 'NODE_ENV', nodeEnv)

  if (testMode === undefined) delete process.env.TEST_MODE
  else process.env.TEST_MODE = testMode
}

describe('GET /api/test/login environment guard', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', { ...originalEnv })
    delete process.env.TEST_MODE
    delete process.env.NEXT_PUBLIC_TEST_MODE
    jest.clearAllMocks()
    prisma.user.findUnique.mockResolvedValue(testUser)
    prisma.user.create.mockResolvedValue(testUser)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test.each([
    ['production', undefined],
    ['production', '0'],
    ['production', '1'],
    ['development', undefined],
    ['development', '0'],
    ['development', 'true'],
    ['test', undefined],
    ['test', '0'],
    ['staging', '1'],
    [undefined, '1'],
  ])('rejects NODE_ENV=%s and TEST_MODE=%s without side effects', async (nodeEnv, testMode) => {
    setEnvironment(nodeEnv, testMode)

    const response = await GET(new Request('http://localhost/api/test/login?role=ADMIN'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  test('a public test-mode flag alone cannot enable login', async () => {
    setEnvironment('development', undefined)
    process.env.NEXT_PUBLIC_TEST_MODE = '1'

    const response = await GET(new Request('http://localhost/api/test/login'))

    expect(response.status).toBe(404)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  test('rejects production before even reading the request URL', async () => {
    setEnvironment('production', '1')
    const request = new Request('http://localhost/api/test/login')
    const readUrl = jest.spyOn(request, 'url', 'get')

    const response = await GET(request)

    expect(response.status).toBe(404)
    expect(readUrl).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  test('preserves existing-user login when explicitly enabled in development', async () => {
    setEnvironment('development', '1')
    prisma.user.findUnique.mockResolvedValue(testUser)

    const response = await GET(new Request('http://localhost/api/test/login?role=USER&email=guard@example.com'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, role: 'USER', userId: testUser.id })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: testUser.id },
      data: { role: 'USER', vip: false, freeSessionCredits: 0 },
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(encode).toHaveBeenCalledTimes(1)
    expect(response.headers.get('set-cookie')).toContain('authjs.session-token=guard-test-token')
  })

  test('preserves new-user login when explicitly enabled in a test runtime', async () => {
    setEnvironment('test', '1')
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue(testUser)

    const response = await GET(new Request('http://localhost/api/test/login?role=USER&email=guard@example.com'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, role: 'USER', userId: testUser.id })
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: testUser.email, name: 'Test User', role: 'USER', vip: true, freeSessionCredits: 5 },
    })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(encode).toHaveBeenCalledTimes(1)
    expect(response.headers.get('set-cookie')).toContain('authjs.session-token=guard-test-token')
  })
})
