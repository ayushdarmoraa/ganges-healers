"use client"

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'

interface PlanBenefits { freeSessions?: number; priorityBooking?: boolean; discountPct?: number }
interface Plan { slug: string; title: string; pricePaise: number; interval: string; benefits: PlanBenefits | null }
interface MembershipResp { membership: { id: string; status: string; startDate?: string; nextBillingAt?: string; plan?: { title: string; pricePaise: number; interval: string } } | null; credits: { total: number } }

export default function MembershipPage() {
  useSession() // session data fetched for potential future reactive UI (suppresses unused var lint)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [membership, setMembership] = useState<MembershipResp['membership'] | null>(null)
  const [credits, setCredits] = useState<number>(0)
  const [subscribingPlan, setSubscribingPlan] = useState<null | string>(null)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  interface InvoiceLite { id: string; issuedAt: string; totalPaise: number; pdfUrl: string | null }
  const [recentInvoices, setRecentInvoices] = useState<InvoiceLite[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  const fetchMembership = useCallback(async () => {
    try {
      const res = await fetch('/api/memberships/me')
      if (res.ok) {
        const data: MembershipResp = await res.json()
        setMembership(data.membership)
        setCredits(data.credits.total)
      }
    } catch { /* noop */ }
  }, [])

  const fetchPlans = useCallback(async () => {
    setLoadingPlans(true)
    try {
      const res = await fetch('/api/memberships/plans')
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans || [])
      }
    } finally {
      setLoadingPlans(false)
    }
  }, [])

  useEffect(() => { fetchMembership(); fetchPlans() }, [fetchMembership, fetchPlans])
  useEffect(() => {
    const load = async () => {
      setLoadingInvoices(true)
      try {
        const res = await fetch('/api/invoices/me')
        if (res.ok) {
          const data = await res.json()
          setRecentInvoices(data.invoices || [])
        }
      } finally { setLoadingInvoices(false) }
    }
    load()
  }, [])

  useEffect(() => {
    if (polling) {
      const start = Date.now()
      const id = setInterval(async () => {
        await fetchMembership()
        if (membership?.status === 'active' || Date.now() - start > 60000) {
          setPolling(false)
          clearInterval(id)
        }
      }, 4000)
      return () => clearInterval(id)
    }
  }, [polling, membership, fetchMembership])

  const handleSubscribe = async (planSlug: 'MONTHLY' | 'YEARLY') => {
    setError(null)
    setSubscribingPlan(planSlug)
    try {
      const res = await fetch('/api/memberships/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = data.error || 'Subscription initiation failed'
        toast.error(`Subscription initiation failed: ${msg}`)
        setError(msg)
        return
      }
      const json = await res.json()
      const shortUrl: string | null = json.shortUrl || null
      if (shortUrl) {
        toast.success('Redirecting to payment...')
        window.location.href = shortUrl
      } else {
        toast.error('Subscription initiation failed: missing payment URL')
        setError('Missing payment URL')
      }
    } catch (e) {
      const msg = (e as Error).message
      toast.error(`Subscription initiation failed: ${msg}`)
      setError(msg)
    } finally {
      setSubscribingPlan(null)
    }
  }

  const renderPlans = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6">
      {plans.map(p => (
        <div key={p.slug} className="border rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-lg">{p.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{p.interval.toLowerCase()} · ₹{(p.pricePaise/100).toFixed(2)}</p>
            {p.benefits && (
              <ul className="mt-3 text-sm space-y-1 list-disc ml-4">
                {p.benefits.freeSessions && <li>{p.benefits.freeSessions} free sessions</li>}
                {p.benefits.priorityBooking && <li>Priority booking</li>}
                {p.benefits.discountPct && <li>{p.benefits.discountPct}% discount</li>}
              </ul>
            )}
          </div>
          {(() => {
            const normalized = p.slug.toUpperCase() === 'MONTHLY' ? 'MONTHLY' : p.slug.toUpperCase() === 'YEARLY' ? 'YEARLY' : null
            return (
              <Button
                data-cy={normalized === 'MONTHLY' ? 'subscribe-monthly' : normalized === 'YEARLY' ? 'subscribe-yearly' : undefined}
                disabled={!normalized || subscribingPlan === normalized}
                className="mt-4"
                onClick={() => normalized && handleSubscribe(normalized)}
              >
                {subscribingPlan === normalized ? 'Loading…' : 'Subscribe'}
              </Button>
            )
          })()}
        </div>
      ))}
    </div>
  )

  const renderMembership = () => membership && (
    <div className="mt-6 border rounded-lg p-4">
      <h3 className="font-semibold text-lg mb-2">Your Membership</h3>
      <p className="text-sm">Status: <span className="font-medium capitalize">{membership.status}</span></p>
      {membership.plan && <p className="text-sm">Plan: {membership.plan.title} (₹{(membership.plan.pricePaise/100).toFixed(2)} / {membership.plan.interval.toLowerCase()})</p>}
      {membership.nextBillingAt && <p className="text-sm">Next Billing: {new Date(membership.nextBillingAt).toLocaleString()}</p>}
      <p className="text-sm mt-2">Credits: {credits}</p>
      {membership.status === 'pending' && <p className="text-xs text-muted-foreground mt-2">Pending confirmation... waiting for payment activation webhook.</p>}
      {membership.status === 'paused' && <p className="text-xs text-muted-foreground mt-2">Membership paused. Reactivate in Razorpay or contact support.</p>}
      {membership.status === 'cancelled' && <p className="text-xs text-muted-foreground mt-2">Membership cancelled. You keep previously granted credits.</p>}
    </div>
  )

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold">VIP Membership</h1>
      {!membership || (membership.status !== 'active' && membership.status !== 'pending') ? (
        <>
          <p className="text-sm text-muted-foreground mt-2">Choose a plan to unlock VIP benefits.</p>
          {loadingPlans ? <p className="mt-6 text-sm">Loading plans...</p> : renderPlans()}
        </>
      ) : null}
      {renderMembership()}
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Recent invoices</h2>
        {loadingInvoices && <p className="text-sm text-muted-foreground mt-2">Loading invoices…</p>}
        {!loadingInvoices && recentInvoices.length === 0 && <p className="text-sm text-muted-foreground mt-2">No invoices yet.</p>}
        <ul className="mt-3 space-y-2">
          {recentInvoices.slice(0,5).map(inv => (
            <li key={inv.id} className="text-sm flex items-center justify-between border rounded p-2">
              <span>{new Date(inv.issuedAt).toLocaleDateString()} · ₹{(inv.totalPaise/100).toFixed(2)}</span>
              {inv.pdfUrl ? <a href={inv.pdfUrl} className="text-primary underline" target="_blank" rel="noreferrer">View</a> : <span className="text-xs text-muted-foreground">Generating…</span>}
            </li>
          ))}
        </ul>
      </div>
      {polling && <p className="mt-4 text-sm">Polling for activation...</p>}
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </div>
  )
}
