"use client"

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import { authPathWithCallback } from '@/lib/auth/callback-url'

interface CourseData {
  id: string
  slug: string
  title: string
  description: string
  pricePaise: number
  imageUrl: string | null
  lessons: { id: string; title: string; order: number }[]
  _count: { enrollments: number }
}

export default function CourseEnrollButton({ course }: { course: CourseData }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const [pendingCheckout, setPendingCheckout] = useState(false)
  const verifyingRef = useRef(false)
  const coursePath = `/courses/${encodeURIComponent(course.slug)}`
  const lessonId = course.lessons[0]?.id
  const learningPath = lessonId ? `${coursePath}/lesson/${encodeURIComponent(lessonId)}` : '/courses/enrolled'

  useEffect(() => {
    let current = true
    setEnrolled(false)
    setPendingCheckout(false)
    if (!session?.user?.id) return
    fetch(`/api/courses/enrollments/me`)
      .then(r => r.json())
      .then((data: { courseId: string }[]) => {
        if (current && Array.isArray(data) && data.some(e => e.courseId === course.id)) {
          setEnrolled(true)
        }
      })
      .catch(() => {})
    return () => { current = false }
  }, [session?.user?.id, course.id])

  if (enrolled) {
    return (
      <Button onClick={() => router.push(learningPath)}>
        {lessonId ? 'Continue Learning' : 'View My Courses'}
      </Button>
    )
  }

  async function handleEnroll() {
    if (status === 'loading') return
    if (!session?.user?.id) {
      router.push(authPathWithCallback('/auth/signin', coursePath))
      return
    }
    setLoading(true)
    try {
      const enrollRes = await fetch(`/api/courses/${encodeURIComponent(course.slug)}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const body: unknown = await enrollRes.json().catch(() => null)
      const data = body && typeof body === 'object' ? body as Record<string, unknown> : null
      if (data?.enrolled === true && typeof data.enrollmentId === 'string' && data.enrollmentId.trim() &&
          ((enrollRes.ok && data.amountPaise === 0) || enrollRes.status === 409)) {
        setEnrolled(true)
        toast.success('You are enrolled.')
        router.push(learningPath)
        return
      }
      if (!enrollRes.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Enrollment failed')
      const { orderId, amountPaise, key } = data ?? {}
      if (typeof orderId !== 'string' || !orderId || typeof key !== 'string' || !key ||
          typeof amountPaise !== 'number' || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        throw new Error('Checkout could not be prepared. Please try again.')
      }
      setPendingCheckout(true)

      const result = await openRazorpayCheckout({
        orderId,
        amountPaise,
        key,
        prefill: { email: session.user.email || '', name: session.user.name || '' },
        description: `Course: ${course.title}`,
      })

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
      if (!verified || typeof verified !== 'object' || !('verified' in verified) || verified.verified !== true) throw new Error('Payment verification could not be confirmed. Please refresh your courses.')

      setEnrolled(true)
      toast.success('Enrolled! Redirecting to course…')
      setTimeout(() => router.push(learningPath), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg === 'Payment dismissed') {
        toast.error('Payment was cancelled. You can try again.')
      } else {
        toast.error(msg)
      }
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  return (
    <Button onClick={handleEnroll} disabled={loading || status === 'loading'}>
      {loading || status === 'loading' ? 'Processing…' : pendingCheckout ? 'Continue checkout' : course.pricePaise === 0 ? 'Enroll for free' : `Enroll — ₹${(course.pricePaise / 100).toFixed(2)}`}
    </Button>
  )
}
