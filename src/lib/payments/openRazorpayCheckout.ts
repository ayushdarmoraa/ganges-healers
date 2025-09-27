// Client-side helper to open Razorpay Checkout and resolve with signature payload
export interface OpenRazorpayParams {
  orderId: string
  amountPaise: number
  key: string
  prefill?: { name?: string; email?: string };
  notes?: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  description?: string
}

export interface RazorpayResult {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

declare global {
  interface Window { Razorpay?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.Razorpay) return true
  return new Promise(resolve => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

export async function openRazorpayCheckout(params: OpenRazorpayParams): Promise<RazorpayResult> {
  const loaded = await loadRazorpayScript()
  if (!loaded || !window.Razorpay) throw new Error('Failed to load payment gateway')

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: params.key,
      amount: params.amountPaise,
      currency: 'INR',
      name: 'Ganges Healers',
      description: params.description || 'Session payment',
      order_id: params.orderId,
      notes: params.notes || {},
      prefill: params.prefill,
      handler: function (resp: RazorpayResult) {
        resolve(resp)
      },
      modal: {
        ondismiss: function () {
          reject(new Error('Payment dismissed'))
        }
      },
      theme: { color: '#4f46e5' }
    })
    rzp.open()
  })
}
