import { readVariantClient, readAllVariantsClient, persistVariantClient } from '@/lib/experiments/client'

// Importing a browser helper must never load server request context or Prisma.
jest.mock('next/headers', () => { throw new Error('Server request code imported by browser experiment helper') })
jest.mock('@/lib/prisma', () => { throw new Error('Prisma imported by browser experiment helper') })

function setCookieHeader(cookie: string) {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie } })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document')
})

test('is safe to import and call during server rendering', () => {
  expect(readVariantClient('product_headline')).toBeNull()
  expect(readAllVariantsClient()).toEqual({})
})

test.each(['A', 'B'])('reads the assigned %s cookie without server dependencies', variant => {
  setCookieHeader(`other=value; ghx_product_headline=${variant}; ghx_other=A`)
  expect(readVariantClient('product_headline')).toBe(variant)
})

test('returns null for missing or unknown assignments', () => {
  setCookieHeader('other=value; ghx_product_headline=C')
  expect(readVariantClient('product_headline')).toBeNull()
  expect(readVariantClient('missing')).toBeNull()
})

test('reads valid variant cookies while ignoring unrelated or invalid values', () => {
  setCookieHeader('other=A; ghx_product_headline=B; ghx_checkout=A; ghx_inactive=C')
  expect(readAllVariantsClient()).toEqual({ product_headline: 'B', checkout: 'A' })
})


test('persists the rendered variant using the existing cookie contract', () => {
  setCookieHeader('')
  persistVariantClient('product_headline', 'B')
  expect(document.cookie).toBe('ghx_product_headline=B; Max-Age=7776000; Path=/; SameSite=Lax')
})

test('does not write invalid experiment keys', () => {
  setCookieHeader('original=value')
  persistVariantClient('bad;key', 'A')
  expect(document.cookie).toBe('original=value')
})
