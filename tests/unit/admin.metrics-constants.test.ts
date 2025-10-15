import { ensureByTypeKeys, BY_TYPE_KEYS } from '@/lib/admin/metrics-constants'

describe('ensureByTypeKeys', () => {
  test('fills missing as 0 and strips extras', () => {
    const input = { SESSION: 10, EXTRA: 99, MEMBERSHIP: null as any } // eslint-disable-line @typescript-eslint/no-explicit-any
    const out = ensureByTypeKeys(input)
    // Exactly 5 keys
    expect(Object.keys(out).sort()).toEqual([...BY_TYPE_KEYS].sort())
    // Types are numbers
    for (const k of BY_TYPE_KEYS) expect(typeof out[k]).toBe('number')
    // Known values are preserved, null coerced to 0, extras removed
    expect(out.SESSION).toBe(10)
    expect(out.MEMBERSHIP).toBe(0)
  expect('EXTRA' in (out as unknown as Record<string, number>)).toBe(false)
  })
})
