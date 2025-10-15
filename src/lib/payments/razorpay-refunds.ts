import Razorpay from 'razorpay'

export type RefundResult = {
  gatewayRefundId: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  raw: unknown
}

function mapStatus(s: string | null | undefined): RefundResult['status'] {
  const v = (s || '').toLowerCase()
  if (v === 'processed' || v === 'success' || v === 'succeeded') return 'SUCCESS'
  if (v === 'failed' || v === 'failure') return 'FAILED'
  return 'PENDING'
}

export async function refundPayment(args: { paymentId: string; amountPaise: number; notes?: Record<string, string> }): Promise<RefundResult> {
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) {
    throw new Error('Missing Razorpay keys for refund')
  }
  const rz = new Razorpay({ key_id, key_secret })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await rz.payments.refund(args.paymentId, { amount: args.amountPaise, notes: args.notes })
  return {
    gatewayRefundId: String(resp?.id || ''),
    status: mapStatus(resp?.status),
    raw: resp,
  }
}
