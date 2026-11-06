'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Status = { ownerId: string; email: string; verifiedAt: string | null }

/** Account-bound status and resend controls never retain another session's address or results. */
export default function EmailVerificationSettings({ userId, sessionLoading = false }: { userId: string; sessionLoading?: boolean }) {
  const owner = useRef(userId)
  const epoch = useRef(0)
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const refresh = () => setReload(value => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    owner.current = userId; epoch.current++
    setStatus(null); setError(''); setMessage(''); setPending(false)
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/users/me/email-verification', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.ownerId !== userId || typeof body?.email !== 'string' || !(body.verifiedAt === null || typeof body.verifiedAt === 'string' && Number.isFinite(Date.parse(body.verifiedAt)))) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to load email verification.')
      if (!controller.signal.aborted) setStatus(body)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load email verification.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [userId, reload])

  async function request() {
    if (!status || status.ownerId !== userId || pending) return
    const actor = userId, attempt = epoch.current
    setPending(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/users/me/email-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId: actor, email: status.email }) })
      const body = await response.json().catch(() => null)
      if (owner.current !== actor || epoch.current !== attempt) return
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to request email verification.')
      if (body?.ownerId !== actor) throw new Error('The verification request could not be confirmed. Refresh your settings.')
      if (body.status === 'verified' && typeof body.verifiedAt === 'string' && Number.isFinite(Date.parse(body.verifiedAt))) setStatus({ ...status, verifiedAt: body.verifiedAt })
      else if (body.status === 'queued' && typeof body.message === 'string' && body.message.trim()) setMessage(body.message)
      else throw new Error('The verification request could not be confirmed. Refresh your settings.')
    } catch (cause) {
      if (owner.current === actor && epoch.current === attempt) setError(cause instanceof Error ? cause.message : 'Unable to request email verification.')
    } finally { if (owner.current === actor && epoch.current === attempt) setPending(false) }
  }
  const current = status?.ownerId === userId ? status : null
  return <Card>
    <CardHeader><CardTitle>Email verification</CardTitle><CardDescription>Confirm ownership of the email address on your account.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {sessionLoading || loading ? <p role="status">Loading email verification…</p> : !userId ? <p>Sign in to manage email verification.</p> : current ? <>
        <p className="break-all text-sm">{current.email}</p>
        {current.verifiedAt ? <p role="status">Email verified.</p> : <><p className="text-sm text-muted-foreground">Your email has not been verified.</p><Button type="button" disabled={pending} onClick={() => void request()}>{pending ? 'Requesting…' : 'Send verification link'}</Button></>}
      </> : null}
      {message && current && <p role="status" className="text-sm">{message}</p>}
      {error && userId && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {userId && !loading && !pending && <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Refresh verification status</Button>}
    </CardContent>
  </Card>
}
