import { authPathWithCallback, safeCallbackUrl } from '@/lib/auth/callback-url'

test.each([
  '/dashboard/membership',
  '/services/reiki?openBooking=1&healerId=h_2&productSlug=copper-bottle',
  '/dashboard/orders?page=2',
  '/community/post/example#comments',
  '/services?search=Yoga%20Therapy',
])('preserves the local journey %s', value => {
  expect(safeCallbackUrl(value)).toBe(value)
})

test.each([
  undefined, null, '', ['one', 'two'], 'https://evil.example/checkout', 'https://callback.invalid/dashboard',
  '//evil.example/checkout', 'javascript:alert(1)', '/\\evil.example', '/%2f%2fevil.example',
  '/%252f%252fevil.example', '/%5cevil.example', '/%0a/evil.example', '/%broken',
  '/auth/signin?callbackUrl=/auth/signin', '/auth/error', '/auth/%73ignin', '/register', '/register/',
  '/api/auth/signout', '/api/test/login', '/dashboard\r\nLocation:https://evil.example',
])('rejects an external, ambiguous or looping destination (%j)', value => {
  expect(safeCallbackUrl(value)).toBe('/dashboard')
})

test('rejects an overlong callback', () => {
  expect(safeCallbackUrl('/' + 'x'.repeat(4096))).toBe('/dashboard')
})

test('auth links round-trip one local callback through query encoding', () => {
  const callback = '/services/reiki?openBooking=1&healerId=h_2'
  const link = authPathWithCallback('/auth/signin', callback)
  expect(new URL(link, 'https://example.test').searchParams.get('callbackUrl')).toBe(callback)
  expect(authPathWithCallback('/register', '/dashboard')).toBe('/register')
  expect(authPathWithCallback('/auth/signin', '//evil.example')).toBe('/auth/signin')
})
