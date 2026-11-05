'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authPathWithCallback, safeCallbackUrl } from '@/lib/auth/callback-url'

/** One recovery screen handles both requesting a link and choosing the replacement password. */
export default function PasswordResetForm() {
  const search = useSearchParams()
  const callbacks = search.getAll('callbackUrl')
  const callbackUrl = safeCallbackUrl(callbacks.length === 1 ? callbacks[0] : undefined)
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const tokens = fragment.getAll('token')
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      if (tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0])) setToken(tokens[0])
      else setError('This reset link is invalid. Request a new link below.')
    }
    setReady(true)
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const values = new FormData(event.currentTarget)
    const password = String(values.get('newPassword') || '')
    if (token && password !== values.get('confirmPassword')) { setError('Passwords do not match.'); return }
    setPending(true); setError(null); setMessage(null)
    try {
      const response = await fetch(token ? '/api/auth/password-reset/confirm' : '/api/auth/password-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, newPassword: password } : { email: String(values.get('email') || ''), callbackUrl }),
      })
      const result: unknown = await response.json().catch(() => null)
      const body = result && typeof result === 'object' ? result as Record<string, unknown> : null
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to complete password recovery. Please try again.')
      if ((token && body?.success !== true) || (!token && (typeof body?.message !== 'string' || !body.message.trim()))) {
        throw new Error('Unable to confirm password recovery. Please try again.')
      }
      if (token) { setComplete(true); setToken(null) }
      else setMessage(typeof body?.message === 'string' ? body.message : 'If this email has an account, you will receive a reset link.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete password recovery. Please try again.')
    } finally { setPending(false) }
  }

  return <Card>
    <CardHeader>
      <CardTitle>{complete ? 'Password updated' : token ? 'Choose a new password' : 'Forgot your password?'}</CardTitle>
      <CardDescription>{complete ? 'Your previous sessions have been signed out. Sign in with your new password.' : token ? 'Use a password of at least 8 characters. Your reset link expires after 15 minutes.' : 'Enter the email address you use for Ganges Healers.'}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!ready ? <p role="status">Loading password recovery…</p> : !complete && <form onSubmit={submit} className="space-y-4">
        {token ? <>
          <div><Label htmlFor="newPassword">New password</Label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} disabled={pending} /></div>
          <div><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} disabled={pending} /></div>
        </> : <div><Label htmlFor="resetEmail">Email</Label><Input id="resetEmail" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></div>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Please wait…' : token ? 'Update password' : 'Send reset link'}</Button>
      </form>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {token && <Button type="button" variant="outline" disabled={pending} onClick={() => { setToken(null); setError(null) }}>Request a new link</Button>}
      <Link className="block text-sm underline" href={authPathWithCallback('/auth/signin', callbackUrl)}>{complete ? 'Sign in with your new password' : 'Back to sign in'}</Link>
    </CardContent>
  </Card>
}
