'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authPathWithCallback } from '@/lib/auth/callback-url'
import { signOutCurrentSession } from '@/lib/auth/client-session'

const destinations = { STAFF: '/contact', BOOKINGS: '/dashboard/bookings', MEMBERSHIPS: '/dashboard/membership', PROGRAMS: '/dashboard/programs', ORDERS: '/dashboard/orders', PAYMENTS: '/dashboard/billing' } as const
const snapshotSchema = z.object({
  ownerId: z.string().min(1), reviewVersion: z.string().regex(/^[a-f0-9]{64}$/), reauthenticate: z.boolean(), expiresAt: z.string().datetime().nullable(),
  blockers: z.array(z.object({ code: z.enum(['STAFF', 'BOOKINGS', 'MEMBERSHIPS', 'PROGRAMS', 'ORDERS', 'PAYMENTS']), message: z.string().min(1).max(300) })).max(6),
})
const receiptSchema = z.object({ ownerId: z.string(), closed: z.literal(true), closedAt: z.string().datetime() })
type Snapshot = z.infer<typeof snapshotSchema>
const errorMessage = (body: unknown, fallback: string) => body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : fallback

/** Explicit owner-bound review, fresh sign-in and confirmation; failed submissions retain the review draft. */
export default function AccountClosureSettings({ userId, sessionLoading = false, authenticationAt }: { userId: string; sessionLoading?: boolean; authenticationAt?: number }) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [pending, setPending] = useState(false)
  const [confirmation, setConfirmation] = useState(''), [acknowledged, setAcknowledged] = useState(false), [error, setError] = useState('')
  const [reload, setReload] = useState(0), [now, setNow] = useState(Date.now), [closedOwner, setClosedOwner] = useState<string | null>(null)
  const lifecycle = useRef({ active: false }), busy = useRef(false), signingOut = useRef(false)
  useEffect(() => {
    lifecycle.current = { active: true }; busy.current = false; signingOut.current = false
    const generation = lifecycle.current, controller = new AbortController()
    setSnapshot(null); setLoading(!!userId); setPending(false); setError(''); setConfirmation(''); setAcknowledged(false); setClosedOwner(null)
    if (userId) void fetch('/api/users/account', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to load the account closure review.'))
      const parsed = snapshotSchema.safeParse(body)
      if (!parsed.success || parsed.data.ownerId !== userId || !parsed.data.reauthenticate && !parsed.data.expiresAt) throw new Error('Your account closure review could not be confirmed. Refresh it before continuing.')
      if (!controller.signal.aborted) { setSnapshot(parsed.data); setNow(Date.now()) }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the account closure review.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); generation.active = false }
  }, [userId, authenticationAt, reload])
  useEffect(() => {
    if (!snapshot?.expiresAt) return
    const until = Date.parse(snapshot.expiresAt)
    if (until <= Date.now()) return
    const timer = window.setInterval(() => { const current = Date.now(); setNow(current); if (current >= until) window.clearInterval(timer) }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.expiresAt])
  const current = snapshot?.ownerId === userId ? snapshot : null
  const closed = closedOwner === userId && !!userId
  const fresh = current && !current.reauthenticate && !!current.expiresAt && Date.parse(current.expiresAt) > now
  async function finishSignOut() {
    if (signingOut.current) return
    const generation = lifecycle.current
    signingOut.current = true
    setPending(true); setError('')
    try { await signOutCurrentSession('/'); router.replace('/'); router.refresh() }
    catch { if (lifecycle.current === generation && generation.active) setError('Your account is closed. This browser could not finish signing out. Try finishing sign-out again.') }
    finally { if (lifecycle.current === generation && generation.active) { signingOut.current = false; setPending(false) } }
  }
  async function close() {
    if (!current || !fresh || current.blockers.length || busy.current || sessionLoading || confirmation !== 'CLOSE MY ACCOUNT' || !acknowledged || closed) return
    busy.current = true; setPending(true); setError('')
    const generation = lifecycle.current, actor = userId
    try {
      const response = await fetch('/api/users/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId: actor, reviewVersion: current.reviewVersion, confirmation, acknowledged }) })
      const body: unknown = await response.json().catch(() => null)
      if (lifecycle.current !== generation || !generation.active) return
      if (!response.ok) throw new Error(errorMessage(body, 'Account closure was not confirmed. Refresh the review before retrying.'))
      const parsed = receiptSchema.safeParse(body)
      if (!parsed.success || parsed.data.ownerId !== actor) throw new Error('Account closure could not be confirmed. Refresh the review before retrying.')
      setClosedOwner(actor); setConfirmation(''); setAcknowledged(false)
      await finishSignOut()
    } catch (cause) { if (lifecycle.current === generation && generation.active) setError(cause instanceof Error ? cause.message : 'Account closure was not confirmed.') }
    finally { if (lifecycle.current === generation && generation.active) { busy.current = false; setPending(false) } }
  }
  return <Card id="close-account" role="region" aria-label="Close account">
    <CardHeader><CardTitle>Close account</CardTitle><CardDescription>Review your commitments before ending access to your account.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {closed ? <><p role="status">Your account is closed. Sign-in access has ended.</p><Button disabled={pending} onClick={() => void finishSignOut()}>Finish signing out</Button></> : loading || sessionLoading ? <p role="status">Loading account closure review…</p> : current ? <>
        <p className="text-sm">Closing your account ends sign-in and access to saved purchases. Payment, invoice and purchase history are retained. Your email and phone remain associated with this account. This does not erase personal data, cancel purchases or request refunds.</p>
        {current.blockers.length > 0 ? <ul className="list-disc space-y-2 pl-5 text-sm">{current.blockers.map(item => <li key={item.code}>{item.message} <Link className="underline" href={destinations[item.code]}>Review {item.code === 'STAFF' ? 'with support' : item.code.toLowerCase()}</Link></li>)}</ul> : <p className="text-sm">No active commitments currently block closure. The final confirmation checks again.</p>}
        {!fresh && <p className="text-sm">Sign in again to confirm closure within five minutes. Use your usual authenticator or recovery code if enabled. <Link className="underline" href={authPathWithCallback('/auth/signin', '/dashboard/settings#close-account')}>Sign in again</Link></p>}
        <form aria-label="Confirm account closure" className="space-y-3" onSubmit={event => { event.preventDefault(); void close() }}>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 focus-ring" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={pending || !fresh || current.blockers.length > 0} />I understand that account access ends and my existing records are retained.</label>
          <label className="grid gap-1 text-sm">Type CLOSE MY ACCOUNT<Input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" maxLength={16} disabled={pending || !fresh || current.blockers.length > 0} /></label>
          <Button type="submit" variant="destructive" disabled={pending || !fresh || current.blockers.length > 0 || !acknowledged || confirmation !== 'CLOSE MY ACCOUNT'}>{pending ? 'Closing account…' : 'Close my account'}</Button>
        </form>
      </> : !userId ? <p>Sign in to review account closure.</p> : null}
      {error && userId && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {userId && !closed && <Button type="button" variant="outline" disabled={loading || pending} onClick={() => setReload(value => value + 1)}>Refresh closure review</Button>}
    </CardContent>
  </Card>
}
