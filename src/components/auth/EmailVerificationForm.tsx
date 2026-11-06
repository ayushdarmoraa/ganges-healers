'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function EmailVerificationForm() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const captured = useRef(false)
  const epoch = useRef(0)
  useEffect(() => {
    const capture = () => {
      // React's development effect replay must not mistake a deliberately cleared fragment for a missing link.
      if (!window.location.hash && captured.current) return
      captured.current = true; epoch.current++
      const tokens = new URLSearchParams(window.location.hash.slice(1)).getAll('token')
      if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      setVerified(false); setPending(false); setError('')
      if (tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0])) setToken(tokens[0])
      else { setToken(null); setError('Use the verification link from your email, or request a new link in account settings.') }
      setReady(true)
    }
    capture()
    window.addEventListener('hashchange', capture)
    return () => window.removeEventListener('hashchange', capture)
  }, [])
  async function verify() {
    if (!token || pending) return
    const attempt = epoch.current
    setPending(true); setError('')
    try {
      const response = await fetch('/api/auth/email-verification/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const body = await response.json().catch(() => null)
      if (epoch.current !== attempt) return
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to verify your email.')
      if (body?.success !== true) throw new Error('Email verification could not be confirmed. Please try again.')
      setToken(null); setVerified(true)
    } catch (cause) { if (epoch.current === attempt) setError(cause instanceof Error ? cause.message : 'Unable to verify your email.') }
    finally { if (epoch.current === attempt) setPending(false) }
  }
  return <Card>
    <CardHeader><CardTitle>{verified ? 'Email verified' : 'Verify your email'}</CardTitle><CardDescription>{verified ? 'Your account email has been confirmed.' : 'Confirm the email address associated with your Ganges Healers account.'}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!ready ? <p role="status">Loading verification…</p> : token && <Button type="button" disabled={pending} onClick={() => void verify()}>{pending ? 'Verifying…' : 'Verify email'}</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Link className="block text-sm underline" href="/dashboard/settings">Return to account settings</Link>
    </CardContent>
  </Card>
}
