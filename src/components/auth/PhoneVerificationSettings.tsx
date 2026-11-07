'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const PROFILE_UPDATED_EVENT = 'ganges:profile-updated'
const snapshotSchema = z.object({
  ownerId: z.string(), phone: z.string().nullable(), verifiedAt: z.string().datetime().nullable(),
  available: z.boolean(), canVerify: z.boolean(), retryAt: z.string().datetime().nullable(),
  challenge: z.object({ id: z.string().uuid(), expiresAt: z.string().datetime() }).nullable(),
})
const actionSchema = snapshotSchema.extend({ status: z.enum(['pending', 'verified']) })
type Snapshot = z.infer<typeof snapshotSchema>
const errorMessage = (body: unknown, fallback: string) => body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : fallback

/** Owner/phone-bound status and code controls ignore obsolete requests and never infer verification from a send acknowledgement. */
export default function PhoneVerificationSettings({ userId, sessionLoading = false }: { userId: string; sessionLoading?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true), [pending, setPending] = useState<'request' | 'confirm' | null>(null)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [code, setCode] = useState('')
  const [consent, setConsent] = useState(false), [reload, setReload] = useState(0), [now, setNow] = useState(Date.now)
  const owner = useRef(userId), lifecycle = useRef({ active: false }), busy = useRef(false)
  useEffect(() => {
    const focus = () => { if (!busy.current) setReload(value => value + 1) }
    const profileChanged = (event: Event) => { if ((event as CustomEvent<{ ownerId?: string }>).detail?.ownerId === userId) setReload(value => value + 1) }
    window.addEventListener('focus', focus); window.addEventListener(PROFILE_UPDATED_EVENT, profileChanged)
    return () => { window.removeEventListener('focus', focus); window.removeEventListener(PROFILE_UPDATED_EVENT, profileChanged) }
  }, [userId])
  useEffect(() => {
    owner.current = userId; lifecycle.current = { active: true }; busy.current = false
    const generation = lifecycle.current
    setSnapshot(null); setError(''); setMessage(''); setCode(''); setConsent(false); setPending(null)
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/users/me/phone-verification', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to load phone verification.'))
      const parsed = snapshotSchema.safeParse(body)
      if (!parsed.success || parsed.data.ownerId !== userId) throw new Error('Unable to confirm phone verification. Refresh your account settings.')
      if (!controller.signal.aborted) { setSnapshot(parsed.data); setNow(Date.now()) }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load phone verification.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); generation.active = false }
  }, [userId, reload])
  useEffect(() => {
    const until = Math.max(Date.parse(snapshot?.retryAt ?? '') || 0, Date.parse(snapshot?.challenge?.expiresAt ?? '') || 0)
    if (until <= Date.now()) return
    const timer = window.setInterval(() => { const current = Date.now(); setNow(current); if (current >= until) window.clearInterval(timer) }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.retryAt, snapshot?.challenge?.expiresAt])
  const current = snapshot?.ownerId === userId ? snapshot : null
  const challenge = current?.challenge && Date.parse(current.challenge.expiresAt) > now ? current.challenge : null
  const wait = Math.max(0, Math.ceil(((Date.parse(current?.retryAt ?? '') || 0) - now) / 1000))

  async function act(action: 'request' | 'confirm') {
    if (!current?.phone || !current.available || !current.canVerify || busy.current || sessionLoading || action === 'request' && (!consent || wait > 0) || action === 'confirm' && (!challenge || !/^\d{4,10}$/.test(code))) return
    const actor = userId, phone = current.phone, attempt = lifecycle.current
    busy.current = true; setPending(action); setError(''); setMessage('')
    try {
      const body = action === 'request' ? { action, ownerId: actor, phone, consent: true } : { action, ownerId: actor, phone, challengeId: challenge!.id, code }
      const response = await fetch('/api/users/me/phone-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result: unknown = await response.json().catch(() => null)
      if (owner.current !== actor || lifecycle.current !== attempt || !attempt.active) return
      if (!response.ok) throw new Error(errorMessage(result, 'Unable to manage phone verification.'))
      const parsed = actionSchema.safeParse(result)
      if (!parsed.success || parsed.data.ownerId !== actor || parsed.data.phone !== phone || parsed.data.status === 'verified' && !parsed.data.verifiedAt || parsed.data.status === 'pending' && (parsed.data.verifiedAt || !parsed.data.challenge) || action === 'confirm' && parsed.data.status !== 'verified') throw new Error('Phone verification could not be confirmed. Refresh the status before retrying.')
      setSnapshot(parsed.data); setNow(Date.now()); setConsent(false)
      if (!parsed.data.verifiedAt) setMessage('Verification requested. Enter the code from your SMS.')
    } catch (cause) { if (owner.current === actor && lifecycle.current === attempt && attempt.active) setError(cause instanceof Error ? cause.message : 'Unable to manage phone verification.') }
    finally { if (owner.current === actor && lifecycle.current === attempt && attempt.active) { busy.current = false; setPending(null); setCode('') } }
  }
  return <Card role="region" aria-label="Phone verification">
    <CardHeader><CardTitle>Phone verification</CardTitle><CardDescription>Confirm ownership of the phone number saved on your account.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {loading || sessionLoading ? <p role="status">Loading phone verification…</p> : !userId ? <p>Sign in to verify your phone.</p> : current ? <>
        {current.phone && <p className="break-all text-sm">{current.phone}</p>}
        {current.verifiedAt ? <p role="status">Phone verified.</p> : <>
          <p className="text-sm text-muted-foreground">Your phone has not been verified.</p>
          {!current.canVerify ? <p className="text-sm">Save your phone in Profile with +, its country code and digits only, for example +919876543210.</p> : !current.available ? <p className="text-sm">SMS verification is temporarily unavailable. Please try again later.</p> : <>
            {challenge ? <form className="space-y-2" aria-label="Verify phone code" onSubmit={event => { event.preventDefault(); void act('confirm') }}>
              <label className="grid gap-1 text-sm">SMS verification code<Input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} disabled={!!pending} /></label>
              <Button type="submit" disabled={!!pending || !/^\d{4,10}$/.test(code)}>{pending === 'confirm' ? 'Checking code…' : 'Verify phone'}</Button>
            </form> : current.challenge ? <p className="text-sm">This code expired. Request a new code.</p> : null}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 focus-ring" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!!pending} />I agree to receive a phone verification SMS at this number.</label>
            <Button type="button" variant="outline" disabled={!!pending || !consent || wait > 0} onClick={() => void act('request')}>{pending === 'request' ? 'Requesting code…' : 'Request verification code'}</Button>
            {wait > 0 && <p className="text-xs text-muted-foreground">You can request another code in {wait < 60 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.</p>}
          </>}
        </>}
      </> : null}
      {error && userId && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && current && <p role="status" className="text-sm">{message}</p>}
      {userId && <Button type="button" variant="outline" disabled={loading || !!pending} onClick={() => setReload(value => value + 1)}>Refresh phone verification</Button>}
    </CardContent>
  </Card>
}
