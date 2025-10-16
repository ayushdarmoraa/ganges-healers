import crypto from 'node:crypto'

describe('webhook side-effects (flag OFF)', () => {
  const secret = 'whsec_test'
  const path = 'src/app/api/payments/webhook/route'
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test_123' } } },
  })

  function signedHeaders(b: string) {
    const sig = crypto.createHmac('sha256', secret).update(b).digest('hex')
    return { 'x-razorpay-signature': sig, 'content-type': 'application/json' }
  }

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
    process.env.PAYMENT_EVENTS_ENABLED = 'false'
  })

  it('verifies and returns ok without calling generator', async () => {
    jest.resetModules()
    jest.mock('@/lib/invoices', () => ({
      createAndStoreInvoicePdf: jest.fn(),
    }))
  const mod: unknown = await import(/* @vite-ignore */ '../../' + path)
  const { POST } = mod as { POST: (req: Request) => Promise<Response> }
  const res = await POST(new Request('http://test.local', { method: 'POST', body, headers: signedHeaders(body) }))
  const json = await res.json()
    expect(json).toEqual({ ok: true })

  const invoicesMod: unknown = await import('@/lib/invoices')
  const { createAndStoreInvoicePdf } = invoicesMod as { createAndStoreInvoicePdf: jest.Mock }
  expect(createAndStoreInvoicePdf).not.toHaveBeenCalled()
  })
})
