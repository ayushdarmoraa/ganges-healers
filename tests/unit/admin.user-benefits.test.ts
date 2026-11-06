import { userBenefitsSchema, userBenefitsVersion } from '@/lib/admin/user-benefits'
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
const input = { userId: 'customer', version: 'a'.repeat(64), vip: true, freeSessionCredits: 2, reason: '  Service recovery  ' }
test('valid whole credit balances retain exact values and normalize the audit reason', () => {
  expect(userBenefitsSchema.parse(input)).toEqual({ ...input, reason: 'Service recovery' })
  expect(userBenefitsSchema.parse({ ...input, freeSessionCredits: 0 }).freeSessionCredits).toBe(0)
  expect(userBenefitsSchema.parse({ ...input, freeSessionCredits: 2147483647 }).freeSessionCredits).toBe(2147483647)
})
test.each([-1, 0.5, NaN, Infinity, 2147483648, '2', '', null])('invalid credit input %s cannot become an account balance', freeSessionCredits => {
  expect(userBenefitsSchema.safeParse({ ...input, freeSessionCredits }).success).toBe(false)
})
test.each([{ vip: 'true' }, { reason: '  ' }, { reason: 'x'.repeat(301) }, { version: 'old-timestamp' }, { userId: '' }, { role: 'ADMIN' }])('malformed or unexpected benefit fields fail closed: %p', override => {
  expect(userBenefitsSchema.safeParse({ ...input, ...override }).success).toBe(false)
})
test('the reviewed version changes with identity or benefit edits even when updatedAt is retained', () => {
  const user = { id: 'customer', email: 'original@example.test', name: 'Original', role: 'USER' as const, vip: false, freeSessionCredits: 3, updatedAt: new Date('2026-01-01') }
  for (const edit of [{ email: 'changed@example.test' }, { name: 'Changed' }, { role: 'ADMIN' as const }, { vip: true }, { freeSessionCredits: 2 }]) expect(userBenefitsVersion({ ...user, ...edit })).not.toBe(userBenefitsVersion(user))
})
