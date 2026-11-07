import Razorpay from 'razorpay'

export type RefundResult = {
  gatewayRefundId: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN'
  raw: unknown
}

export function hasRazorpayRefundCredentials() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

function mapStatus(s: string | null | undefined): RefundResult['status'] {
  const v = (s || '').toLowerCase()
  if (v === 'processed' || v === 'success' || v === 'succeeded') return 'SUCCESS'
  if (v === 'failed' || v === 'failure') return 'FAILED'
  if (v === 'pending') return 'PENDING'
  return 'UNKNOWN'
}

function createRazorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) {
    throw new Error('Missing Razorpay keys for refund')
  }
  return new Razorpay({ key_id, key_secret })
}

export async function refundPayment(args: {
  paymentId: string
  amountPaise: number
  receipt?: string
  notes?: Record<string, string>
}): Promise<RefundResult> {
  const rz = createRazorpayClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await rz.payments.refund(args.paymentId, {
    amount: args.amountPaise,
    receipt: args.receipt,
    notes: args.notes,
  })
  return {
    gatewayRefundId: String(resp?.id || ''),
    status: mapStatus(resp?.status),
    raw: resp,
  }
}

export async function fetchRefundStatus(refundId: string, paymentId: string): Promise<RefundResult> {
  const rz = createRazorpayClient()
  const response = await rz.refunds.fetch(refundId, { payment_id: paymentId })
  if (response.payment_id !== paymentId) {
    throw new Error('Razorpay refund does not match the stored payment')
  }
  return {
    gatewayRefundId: response.id,
    status: mapStatus(response.status),
    raw: response,
  }
}
