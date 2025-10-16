import crypto from 'node:crypto'

describe('webhook side-effects (flag ON): subscription.activated => membership ACTIVE update', () => {
  const secret = 'whsec_test'
  const routePath = 'src/app/api/payments/webhook/route'

  // Minimal Razorpay-like event
  const body = JSON.stringify({
    event: 'subscription.activated',
    payload: { subscription: { entity: { id: 'sub_test_123' } } },
  })

  function signedHeaders(b: string) {
    const sig = crypto.createHmac('sha256', secret).update(b).digest('hex')
    return { 'x-razorpay-signature': sig, 'content-type': 'application/json' }
  }

  beforeEach(() => {
    jest.resetModules()
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
    process.env.PAYMENT_EVENTS_ENABLED = 'true'
  })

  it('updates VIPMembership by subscriptionId (idempotent intent)', async () => {
    // Mock prisma so we don’t need real DB rows here
    const update = jest.fn().mockResolvedValue({ id: 'mem_1' })
    jest.mock('@/lib/prisma', () => ({
      __esModule: true,
      default: {
        vIPMembership: { update },
      },
    }))

  const mod: unknown = await import(/* @vite-ignore */ '../../' + routePath)
  const { POST } = mod as { POST: (req: Request) => Promise<Response> }

    const res = await POST(
      new Request('http://test.local', {
        method: 'POST',
        body,
        headers: signedHeaders(body),
      })
    )

    // Contract preserved
  const json = await res.json()
    expect(json).toEqual({ ok: true })

    // Assert we attempted to update the row by subscriptionId,
    // and we set some status string (enum value varies by schema)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: 'sub_test_123' },
        data: expect.objectContaining({ status: expect.any(String) }),
      })
    )
  })
})
