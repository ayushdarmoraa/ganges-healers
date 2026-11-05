"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authPathWithCallback } from '@/lib/auth/callback-url'

type Props = { mode: 'request' | 'reset'; callbackUrl?: string; token?: string }

/** Recovery forms share delivery, retry and success states without including tokens in logs or storage. */
export default function PasswordRecoveryForm({ mode, callbackUrl, token }: Props) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const isReset = mode === 'reset'
  const [resetToken, setResetToken] = useState(token)
  const [tokenReady, setTokenReady] = useState(!isReset || token !== undefined)
  useEffect(() => {
    if (!isReset || token !== undefined) return
    const values = new URLSearchParams(window.location.hash.slice(1)).getAll('token')
    setResetToken(values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : undefined)
    setTokenReady(true)
    // Keep the token only in this form's memory after the email link is opened.
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }, [isReset, token])
  const missingToken = isReset && !done && tokenReady && !resetToken

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setError('')
    if (isReset && data.get('newPassword') !== data.get('confirmPassword')) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/auth/${isReset ? 'reset-password' : 'forgot-password'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isReset ? { token: resetToken, newPassword: data.get('newPassword') } : { email: data.get('email'), callbackUrl }),
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok || !result || typeof result !== 'object' || !('success' in result) || result.success !== true) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error : 'Your request could not be completed. Please try again.'
        throw new Error(message)
      }
      form.reset()
      if (isReset) setResetToken(undefined)
      setDone(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your request could not be completed. Please try again.')
    } finally { setSaving(false) }
  }

  return <div className="container mx-auto max-w-md px-4 py-16">
    <Card>
      <CardHeader>
        <CardTitle>{isReset ? 'Choose a new password' : 'Forgot your password?'}</CardTitle>
        <CardDescription>{isReset ? 'Set a new password for your Ganges Healers account.' : 'Enter your account email to request a password reset link.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!tokenReady ? <p role="status">Opening your reset link…</p> : missingToken ? <p role="alert">This reset link is incomplete. Request a new link to continue.</p> : done ? <p role="status">
          {isReset ? 'Your password has been updated. Sign in with your new password. Previous sessions have been signed out.' : 'If an account with a password matches that email, we will send a reset link. Check your inbox and spam folder.'}
        </p> : <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
          {isReset ? <>
            <div className="space-y-2">
              <Label htmlFor="recovery-password">New password</Label>
              <Input id="recovery-password" name="newPassword" type="password" autoComplete="new-password" minLength={6} maxLength={72} required disabled={saving} aria-describedby="password-guidance" />
              <p id="password-guidance" className="text-sm text-muted-foreground">Use at least 6 characters and choose a password you have not used elsewhere.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery-confirm">Confirm new password</Label>
              <Input id="recovery-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} maxLength={72} required disabled={saving} />
            </div>
          </> : <div className="space-y-2">
            <Label htmlFor="recovery-email">Email</Label>
            <Input id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={saving} />
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Please wait…' : isReset ? 'Reset password' : 'Send reset link'}</Button>
        </form>}
        {isReset && (!done || missingToken) && <p className="text-sm"><Link href={authPathWithCallback('/auth/forgot-password', callbackUrl)} className="text-primary hover:underline">Request a new reset link</Link></p>}
        <p className="text-center text-sm"><Link href={authPathWithCallback('/auth/signin', callbackUrl)} className="text-primary hover:underline">Back to sign in</Link></p>
      </CardContent>
    </Card>
  </div>
}
