import crypto from 'node:crypto'

describe('webhook side-effects (flag ON): payment.captured => invoice', () => {
  const secret = 'whsec_test'
  const path = 'src/app/api/payments/webhook/route'
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test_456' } } },
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

  it('calls createAndStoreInvoicePdf with gateway payment id', async () => {
    const createAndStoreInvoicePdf = jest.fn().mockResolvedValue('https://blob/url.pdf')
    jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf }))
  const mod: unknown = await import(/* @vite-ignore */ '../../' + path)
  const { POST } = mod as { POST: (req: Request) => Promise<Response> }
  const res = await POST(new Request('http://test.local', { method: 'POST', body, headers: signedHeaders(body) }))
  const json = await res.json()
    expect(json).toEqual({ ok: true })
    expect(createAndStoreInvoicePdf).toHaveBeenCalledTimes(1)
    expect(createAndStoreInvoicePdf).toHaveBeenCalledWith('pay_test_456', { force: false })
  })
})
