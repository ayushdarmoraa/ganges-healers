import { computeRefund } from '@/lib/bookings/refund-policy'

describe('refund policy bands', () => {
  const price = 10000 // ₹100

  test('<24h => NONE', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'NONE', refundPaise: 0 })
  })

  test('=24h => HALF', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'HALF', refundPaise: 5000 })
  })

  test('<48h => HALF', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 36 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'HALF', refundPaise: 5000 })
  })

  test('=48h => FULL', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 48 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'FULL', refundPaise: 10000 })
  })

  test('>48h => FULL', () => {
    const now = new Date('2025-01-01T00:00:00.000Z')
    const start = new Date(now.getTime() + 72 * 60 * 60 * 1000)
    expect(computeRefund(start, now, price)).toEqual({ band: 'FULL', refundPaise: 10000 })
  })
})
