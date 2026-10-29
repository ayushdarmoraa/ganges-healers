import { POST } from '@/app/api/admin/generate-product-content/route'
import { AIContentNotConfiguredError, generateProductContent } from '@/lib/ai/generate-product-content'

jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/lib/rbac', () => ({ requireAdmin: jest.fn() }))

const sdk = jest.requireMock<{ default: jest.Mock }>('openai').default
const admin = jest.requireMock<{ requireAdmin: jest.Mock }>('@/lib/rbac').requireAdmin
const complete = jest.fn()
const input = { title: 'Test Tool', category: 'Tools', chakra: 'Heart', material: 'Wood', purpose: 'Meditation' }
const output = { shortDescription: 'Short', longDescription: 'Long', spiritualBenefits: ['Calm'], ritualUse: ['Hold'], consecrationStory: 'Story' }
const request = (body: unknown = input) => new Request('http://localhost/api/admin/generate-product-content', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.replaceProperty(process, 'env', { ...process.env, OPENAI_API_KEY: undefined })
  sdk.mockImplementation(() => ({ chat: { completions: { create: complete } } }))
  complete.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(output) } }] })
  admin.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
})
afterEach(() => jest.restoreAllMocks())

test('imports the generator without constructing an optional SDK client', () => {
  jest.isolateModules(() => {
    const isolatedSdk = jest.requireMock<{ default: jest.Mock }>('openai').default
    isolatedSdk.mockClear()
    jest.requireActual('@/lib/ai/generate-product-content')
    expect(isolatedSdk).not.toHaveBeenCalled()
  })
})

test('rejects missing configuration only when generation is requested', async () => {
  await expect(generateProductContent(input)).rejects.toBeInstanceOf(AIContentNotConfiguredError)
  expect(sdk).not.toHaveBeenCalled()
})

test('returns a safe configuration response for an authorized request', async () => {
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'AI content generation is not configured.' })
  expect(sdk).not.toHaveBeenCalled()
})

test('checks admin access before revealing configuration status', async () => {
  admin.mockRejectedValue(new Error('Forbidden'))
  expect((await POST(request())).status).toBe(403)
  expect(sdk).not.toHaveBeenCalled()
})

test('validates input before constructing the client', async () => {
  expect((await POST(request({ title: '' }))).status).toBe(400)
  expect(sdk).not.toHaveBeenCalled()
})

test('returns 400 for malformed JSON', async () => {
  const response = await POST(new Request('http://localhost/api/admin/generate-product-content', { method: 'POST', body: '{' }))
  expect(response.status).toBe(400)
  expect(sdk).not.toHaveBeenCalled()
})

test('preserves the configured success response', async () => {
  process.env.OPENAI_API_KEY = 'test-only-configured-key'
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(output)
  expect(sdk).toHaveBeenCalledTimes(1)
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }))
})

test('keeps SDK failures safe without logging key fragments or submitted content', async () => {
  process.env.OPENAI_API_KEY = 'test-only-configured-key'
  complete.mockRejectedValue(new Error('Private key fragment and submitted content'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const response = await POST(request())
  expect(response.status).toBe(500)
  expect(log).toHaveBeenCalledWith('[AI Generate Product Content]', { type: 'Error' })
  expect(await response.text()).not.toContain('Private key fragment')
})
