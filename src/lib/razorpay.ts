// Lazy Razorpay client construction to avoid build-time crashes when env vars are absent.
// Do NOT instantiate at module load; Next.js may evaluate during build.

let _razorpay: any | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
let _initPromise: Promise<any> | null = null // eslint-disable-line @typescript-eslint/no-explicit-any

export async function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return null
  if (_razorpay) return _razorpay
  if (!_initPromise) {
    _initPromise = import('razorpay').then(mod => {
      const Ctor = (mod as any).default || mod // eslint-disable-line @typescript-eslint/no-explicit-any
      _razorpay = new Ctor({ key_id: keyId, key_secret: keySecret })
      return _razorpay
    })
  }
  await _initPromise
  return _razorpay
}

// For legacy mocks expecting a 'razorpay' export with orders.create, provide a proxy getter.
export const razorpay = {
  // Convenience wrapper for legacy mocks
  orders: {
    async create(params: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const client = await getRazorpayClient()
      if (!client) throw new Error('Razorpay client not configured')
      return client.orders.create(params)
    }
  }
}

