"use client"

import { useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { openRazorpayCheckout, type RazorpayResult } from '@/lib/payments/openRazorpayCheckout'

/** Resume this saved purchase without rebuilding it from the current shopping cart. */
export function OrderPaymentButton({ orderId, ownerId }: { orderId: string; ownerId: string }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<RazorpayResult | null>(null)
  const inFlight = useRef(false)
  const currentOwner = useRef(session?.user?.id)
  currentOwner.current = session?.user?.id
  const permitted = status === 'authenticated' && session?.user?.id === ownerId

  async function pay() {
    if (inFlight.current || !permitted || confirmed) return
    inFlight.current = true
    setBusy(true)
    setError('')
    const checkOwner = () => {
      if (currentOwner.current !== ownerId) throw new Error('Your account changed. Refresh this order before continuing.')
    }
    try {
      checkOwner()
      let proof = pending.current
      if (!proof) {
        const response = await fetch('/api/payments/create-order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'STORE', metadata: { orderId } }),
        })
        const quote = await response.json().catch(() => null)
        checkOwner()
        if (!response.ok) {
          if (response.status === 409) router.refresh()
          throw new Error(quote?.error || 'Payment could not be prepared. Try again.')
        }
        if (!quote || typeof quote.orderId !== 'string' || !quote.orderId || typeof quote.key !== 'string' || !quote.key ||
          !Number.isSafeInteger(quote.amountPaise) || quote.amountPaise <= 0 || quote.currency !== 'INR') {
          throw new Error('Payment could not be prepared. Try again.')
        }
        proof = await openRazorpayCheckout({ orderId: quote.orderId, amountPaise: quote.amountPaise, key: quote.key,
          description: 'Saved store order', prefill: { name: session?.user?.name || '', email: session?.user?.email || '' } })
        checkOwner()
        if (proof.razorpay_order_id !== quote.orderId) throw new Error('Payment does not match this order.')
        pending.current = proof
        setConfirming(true)
      }
      const response = await fetch('/api/payments/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: proof.razorpay_order_id, paymentId: proof.razorpay_payment_id, signature: proof.razorpay_signature }),
      })
      const confirmation = await response.json().catch(() => null)
      checkOwner()
      if (!response.ok || confirmation?.verified !== true) throw new Error(confirmation?.error || 'Payment confirmation is pending. Select Confirm payment to check again.')
      pending.current = null
      setConfirmed(true)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error && error.message === 'Payment dismissed'
        ? 'Payment was cancelled. You can continue when ready.'
        : pending.current && error instanceof TypeError
          ? 'We could not confirm your payment. Select Confirm payment to check again.'
          : error instanceof Error ? error.message : 'Payment could not be completed. Try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Continue payment for this saved order. Its items and total stay the same.</p>
      <Button onClick={pay} disabled={busy || !permitted || confirmed}>{confirmed ? 'Payment confirmed' : busy ? 'Processing…' : confirming ? 'Confirm payment' : 'Continue payment'}</Button>
      {!permitted && status !== 'loading' && <p role="alert" className="text-sm text-destructive">Sign in to the account that placed this order, then refresh this page.</p>}
      {permitted && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
