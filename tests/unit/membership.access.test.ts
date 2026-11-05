import { membershipAccess } from '@/lib/memberships/access'
import { membershipCredits } from '@/lib/memberships/checkout'

const now = new Date('2026-11-04T12:00:00Z')
test('keeps manual VIP access only for accounts without subscriptions', () => {
  expect(membershipAccess(true, [], now)).toBe(true)
  expect(membershipAccess(false, [], now)).toBe(false)
  expect(membershipAccess(true, [{ status: 'pending', endDate: null }], now)).toBe(false)
})
test.each(['cancelled', 'paused', 'halted', 'pending'] as const)('%s membership cannot use a cached VIP flag', status => {
  expect(membershipAccess(true, [{ status, endDate: new Date('2027-01-01') }], now)).toBe(false)
})
test('requires an active unexpired subscription, including the exact expiration boundary', () => {
  expect(membershipAccess(true, [{ status: 'active', endDate: now }], now)).toBe(false)
  expect(membershipAccess(true, [{ status: 'active', endDate: new Date('2026-11-05') }], now)).toBe(true)
  expect(membershipAccess(false, [{ status: 'active', endDate: null }], now)).toBe(true)
})
test('reads configured and legacy credit benefits without inventing a grant', () => {
  expect(membershipCredits({ freeSessions: 2 })).toBe(2)
  expect(membershipCredits(['24 free sessions'])).toBe(24)
  expect(membershipCredits(null)).toBe(0)
  expect(() => membershipCredits({ freeSessions: -1 })).toThrow('Invalid plan benefits')
  expect(() => membershipCredits({ freeSessions: 1.5 })).toThrow('Invalid plan benefits')
})
