import { getVariant } from '@/lib/experiments/ab-testing'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))

const cookies = jest.requireMock<{ cookies: jest.Mock }>('next/headers').cookies
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const store = { get: jest.fn(), set: jest.fn(() => { throw new Error('Cookies are read-only during server rendering') }) }

beforeEach(() => {
  jest.resetAllMocks()
  cookies.mockResolvedValue(store)
  auth.mockResolvedValue(null)
})

test('honors an existing assignment without attempting to write during server rendering', async () => {
  store.get.mockReturnValue({ value: 'B' })
  expect(await getVariant('product_headline')).toBe('B')
  expect(store.set).not.toHaveBeenCalled()
  expect(auth).not.toHaveBeenCalled()
})

test('assigns anonymous variants without writing to a read-only cookie store', async () => {
  jest.spyOn(Math, 'random').mockReturnValueOnce(0.8)
  expect(await getVariant('product_headline')).toBe('B')
  expect(store.set).not.toHaveBeenCalled()
  jest.restoreAllMocks()
})

test('authenticated assignment stays deterministic across requests', async () => {
  auth.mockResolvedValue({ user: { id: 'user-123' } })
  const first = await getVariant('product_headline')
  expect(await getVariant('product_headline')).toBe(first)
  expect(store.set).not.toHaveBeenCalled()
})
