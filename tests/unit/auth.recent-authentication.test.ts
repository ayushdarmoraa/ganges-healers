import { createRecentAuthentication, recentAuthenticationExpiresAt, sessionCredentialVersion } from '@/lib/auth/password-version'

const now = 1_800_000_000_000, version = sessionCredentialVersion('stored-hash', 3)
beforeEach(() => jest.replaceProperty(process, 'env', { NODE_ENV: 'test', AUTH_SECRET: 'isolated-test-signing-key' }))
afterEach(() => jest.restoreAllMocks())
test('fresh normal sign-in proof expires at five minutes and contains no credential fingerprint', () => {
  const proof = createRecentAuthentication('owner', version, now)!
  expect(recentAuthenticationExpiresAt('owner', version, proof, now)).toBe(now + 300_000)
  expect(JSON.stringify(proof)).not.toContain(version)
  expect(recentAuthenticationExpiresAt('owner', version, proof, now + 299_999)).not.toBeNull()
  expect(recentAuthenticationExpiresAt('owner', version, proof, now + 300_000)).toBeNull()
})
test('proof cannot be transferred to another account, password or factor version', () => {
  const proof = createRecentAuthentication('owner', version, now)
  expect(recentAuthenticationExpiresAt('another', version, proof, now)).toBeNull()
  expect(recentAuthenticationExpiresAt('owner', sessionCredentialVersion('new-hash', 3), proof, now)).toBeNull()
  expect(recentAuthenticationExpiresAt('owner', sessionCredentialVersion('stored-hash', 4), proof, now)).toBeNull()
})
test('changing the timestamp or signature does not renew a previous login', () => {
  const proof = createRecentAuthentication('owner', version, now)!
  expect(recentAuthenticationExpiresAt('owner', version, { ...proof, issuedAt: now + 1 }, now + 1)).toBeNull()
  expect(recentAuthenticationExpiresAt('owner', version, { ...proof, proof: 'f'.repeat(64) }, now)).toBeNull()
})
test.each([undefined, { issuedAt: NaN, proof: 'a'.repeat(64) }, { issuedAt: now, proof: 'short' }, { issuedAt: now + 30_001, proof: 'a'.repeat(64) }])('absent or malformed recent authentication fails closed (%#)', input => {
  expect(recentAuthenticationExpiresAt('owner', version, input, now)).toBeNull()
})
test('missing signing configuration disables proof issuance; rotation invalidates existing proof', () => {
  const proof = createRecentAuthentication('owner', version, now)
  process.env.AUTH_SECRET = 'replacement-isolated-key'
  expect(recentAuthenticationExpiresAt('owner', version, proof, now)).toBeNull()
  delete process.env.AUTH_SECRET
  expect(createRecentAuthentication('owner', version, now)).toBeUndefined()
  expect(recentAuthenticationExpiresAt('owner', version, proof, now)).toBeNull()
})
