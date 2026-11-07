"use client"

import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/client'
import { toast } from 'sonner'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import { authPathWithCallback } from '@/lib/auth/callback-url'

type Props = {
  programSlug: string
  programTitle: string
  pricePaise: number
  serviceSlug?: string
}

export default function ProgramEnrollSoon({ programSlug, programTitle, pricePaise, serviceSlug }: Props) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [pendingCheckout, setPendingCheckout] = useState(false)
  const verifyingRef = useRef(false)

  const handleEnroll = async () => {
    if (status === 'loading') return
    // Analytics
    if (typeof window !== 'undefined') {
      const path = window.location.pathname + window.location.search
      track('program_enroll_click', {
        programSlug,
        serviceSlug,
        path,
        ts: Date.now(),
      })
    }

    // Auth guard
    if (!session?.user?.id) {
      router.push(authPathWithCallback('/auth/signin', `/programs/${encodeURIComponent(programSlug)}`))
      return
    }

    setLoading(true)
    setError('')

    try {
      // Step 1: Create enrollment + Razorpay order
      const enrollRes = await fetch(`/api/programs/${encodeURIComponent(programSlug)}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const raw: unknown = await enrollRes.json().catch(() => null)
      const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
      if (enrollRes.status === 409 && body?.enrolled === true && typeof body.enrollmentId === 'string' && body.enrollmentId) {
        router.push('/dashboard/programs')
        return
      }
      if (!enrollRes.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Enrollment failed')
      const { orderId, amountPaise, enrollmentId, key } = body ?? {}
      if (typeof orderId !== 'string' || !orderId || typeof key !== 'string' || !key || typeof enrollmentId !== 'string' || !enrollmentId || typeof amountPaise !== 'number' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('Checkout could not be prepared. Please try again.')
      setPendingCheckout(true)

      // Step 2: Open Razorpay checkout
      const result = await openRazorpayCheckout({
        orderId,
        amountPaise,
        key,
        prefill: { email: session.user.email || '', name: session.user.name || '' },
        notes: { enrollmentId, programSlug },
        description: `Program: ${programTitle}`,
      })

      // Step 3: Verify payment
      if (verifyingRef.current) return
      verifyingRef.current = true

      const verifyRes = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        }),
      })

      if (!verifyRes.ok) {
        const vErr = await verifyRes.json().catch(() => ({}))
        throw new Error(vErr.error || 'Payment verification failed')
      }
      const verified: unknown = await verifyRes.json().catch(() => null)
      if (!verified || typeof verified !== 'object' || !('verified' in verified) || verified.verified !== true) throw new Error('Payment verification could not be confirmed. Please refresh your enrollments.')

      setSuccess(true)
      toast.success('Enrollment confirmed! Redirecting to dashboard…')
      setTimeout(() => router.push('/dashboard/programs'), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg === 'Payment dismissed') {
        setError('Payment was cancelled. You can try again.')
      } else {
        setError(msg)
      }
      toast.error(msg === 'Payment dismissed' ? 'Payment cancelled' : msg)
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  if (success) {
    return (
      <Card className="mt-6 p-4 border-green-300 bg-green-50">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <div className="text-base font-medium text-green-800">Enrolled successfully!</div>
            <div className="text-sm text-green-700">Redirecting to your dashboard…</div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-base font-medium">Enroll in this program</div>
          <div className="text-sm text-muted-foreground">₹{(pricePaise / 100).toFixed(2)} — full program access</div>
        </div>
        <Button
          type="button"
          onClick={handleEnroll}
          disabled={loading || status === 'loading'}
          className="shrink-0 bg-purple-600 hover:bg-purple-700"
        >
          {loading || status === 'loading' ? 'Processing…' : pendingCheckout ? 'Continue checkout' : 'Enroll Now'}
        </Button>
      </div>
      {error && (
        <div className="mt-3 text-sm text-red-600">{error}</div>
      )}
    </Card>
  )
}
