/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeNextRequest, readJSON } from '../helpers/next-handler'

// Mock auth to simulate non-admin user
jest.mock('@/lib/auth', () => {
  return {
    auth: async () => ({
      user: {
        id: 'user-test-id',
        role: 'USER',
        email: 'user@test.local',
        vip: false,
        freeSessionCredits: 0
      }
    })
  }
})

describe('Admin guard (TEST_MODE off)', () => {
  const originalTestMode = process.env.TEST_MODE
  beforeAll(() => { process.env.TEST_MODE = '0' })
  afterAll(() => { process.env.TEST_MODE = originalTestMode })

  test('non-admin access to metrics returns 403', async () => {
    const req = makeNextRequest('http://localhost/api/admin/payments/metrics')
    const mod = await import('@/app/api/admin/payments/metrics/route')
    const res: any = await (mod as any).GET(req as any)
    expect(res.status).toBe(403)
    const body = await readJSON(res)
    expect(body.error).toMatch(/Forbidden/)
  })

  test('non-admin access to timeseries returns 403', async () => {
    const req = makeNextRequest('http://localhost/api/admin/payments/timeseries')
    const mod = await import('@/app/api/admin/payments/timeseries/route')
    const res: any = await (mod as any).GET(req as any)
    expect(res.status).toBe(403)
  })

  test('non-admin access to latest returns 403', async () => {
    const req = makeNextRequest('http://localhost/api/admin/payments/latest')
    const mod = await import('@/app/api/admin/payments/latest/route')
    const res: any = await (mod as any).GET(req as any)
    expect(res.status).toBe(403)
  })

  test('non-admin access to refunds returns 403', async () => {
    const req = makeNextRequest('http://localhost/api/admin/payments/refunds')
    const mod = await import('@/app/api/admin/payments/refunds/route')
    const res: any = await (mod as any).GET(req as any)
    expect(res.status).toBe(403)
  })
})
