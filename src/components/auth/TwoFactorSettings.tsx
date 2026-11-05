'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authPathWithCallback } from '@/lib/auth/callback-url'
import { signOutCurrentSession } from '@/lib/auth/client-session'

type Status = { ownerId: string; enabled: boolean; hasPassword: boolean; recoveryCodesRemaining: number }
type Setup = { secret: string; qrDataUrl: string; expiresAt: string }
type Outcome = { ownerId: string; enabled: boolean; codes: string[] }
export default function TwoFactorSettings({ userId, sessionLoading = false }: { userId: string; sessionLoading?: boolean }) {
  const router = useRouter()
  const owner = useRef(userId)
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (userId) owner.current = userId
    setPending(false); setStatus(null); setSetup(null); setPassword(''); setCode(''); setError(''); setSaved(false)
    if (userId) setOutcome(previous => previous?.ownerId === userId ? previous : null)
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/users/me/two-factor', { cache: 'no-store', signal: controller.signal }).then(async res => {
      const body = await res.json().catch(() => null)
      if (!res.ok || typeof body?.enabled !== 'boolean' || typeof body?.hasPassword !== 'boolean' || !Number.isSafeInteger(body?.recoveryCodesRemaining)) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not load account security')
      if (!controller.signal.aborted) setStatus({ ...body, ownerId: userId })
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load account security') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [userId, reload])
  async function act(action: 'begin' | 'enable' | 'disable' | 'recovery' | 'cancel') {
    const actor = userId
    if (!actor || pending || !password) return
    setPending(true); setError('')
    try {
      const res = await fetch('/api/users/me/two-factor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, password, ...(['enable','disable','recovery'].includes(action) ? { code: code.trim() } : {}) }) })
      const body = await res.json().catch(() => null)
      if (owner.current !== actor) return
      if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not update account security')
      if (body?.success !== true || typeof body?.enabled !== 'boolean') throw new Error('The security update could not be confirmed. Refresh your settings.')
      if (action === 'begin') {
        if (body.enabled !== false || typeof body.secret !== 'string' || !/^[A-Z2-7]{32}$/.test(body.secret) || typeof body.qrDataUrl !== 'string' || !body.qrDataUrl.startsWith('data:image/gif;base64,') || typeof body.expiresAt !== 'string' || !Number.isFinite(Date.parse(body.expiresAt))) throw new Error('Authenticator setup could not be confirmed. Try again.')
        setSetup({ secret: body.secret, qrDataUrl: body.qrDataUrl, expiresAt: body.expiresAt })
      } else if (action === 'cancel') { setSetup(null); setCode(''); setPassword('') }
      else {
        if (body.reauthenticate !== true || action !== 'disable' && (!Array.isArray(body.recoveryCodes) || body.recoveryCodes.length !== 8 || !body.recoveryCodes.every((value: unknown) => typeof value === 'string' && /^[A-F0-9-]{39}$/.test(value)))) throw new Error('The security update could not be confirmed. Refresh your settings.')
        setOutcome({ ownerId: actor, enabled: body.enabled, codes: body.recoveryCodes ?? [] }); setSetup(null); setPassword(''); setCode(''); setSaved(false)
      }
    } catch (failure) { if (owner.current === actor) setError(failure instanceof Error ? failure.message : 'Could not update account security') }
    finally { if (owner.current === actor) setPending(false) }
  }
  async function finish() {
    setPending(true); setError('')
    try {
      await signOutCurrentSession('/auth/signin')
      router.push(authPathWithCallback('/auth/signin', '/dashboard/settings'))
      router.refresh()
    }
    catch { setError('Sign out could not be confirmed. Save your codes and try again.') }
    finally { setPending(false) }
  }
  function downloadCodes() {
    if (!outcome || userId && userId !== outcome.ownerId) return
    const url = URL.createObjectURL(new Blob([`Ganges Healers recovery codes\nUse each code once. Store these codes privately.\n\n${outcome.codes.join('\n')}\n`], { type: 'text/plain' }))
    const link = document.createElement('a'); link.href = url; link.download = 'ganges-healers-recovery-codes.txt'; link.click(); URL.revokeObjectURL(url)
  }
  const ownedOutcome = outcome && (!userId || userId === outcome.ownerId) ? outcome : null
  return <Card><CardHeader><CardTitle>Two-factor authentication</CardTitle><CardDescription>Protect email and password sign-in with an authenticator app and one-time recovery codes.</CardDescription></CardHeader><CardContent className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {ownedOutcome ? <div className="space-y-4"><p role="status">{ownedOutcome.enabled ? 'Two-factor authentication is enabled.' : 'Two-factor authentication is disabled.'} Sign in again to continue.</p>{ownedOutcome.codes.length > 0 && <><p>Save these recovery codes now. Each code works once and is shown only here.</p><ul className="grid gap-2 text-sm font-mono">{ownedOutcome.codes.map(value => <li data-test="mfa-recovery-code" key={value}>{value}</li>)}</ul><Button variant="outline" onClick={downloadCodes}>Download recovery codes</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />I saved my recovery codes</label></>}<Button onClick={() => void finish()} disabled={pending || ownedOutcome.codes.length > 0 && !saved}>Sign out and sign in again</Button></div>
    : sessionLoading || loading ? <p role="status">Loading account security…</p>
    : !userId ? <p>Sign in to manage authenticator protection.</p>
    : !status || status.ownerId !== userId ? <Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry account security</Button>
    : !status.hasPassword ? <p>Set an account password before enabling authenticator protection. You can use the password recovery screen to create one.</p>
    : <div className="space-y-4"><p>Status: {status.enabled ? 'Enabled' : 'Not enabled'}{status.enabled && ` · ${status.recoveryCodesRemaining} recovery codes remaining`}</p><p className="text-sm text-muted-foreground">While enabled, use your password and a fresh authenticator or recovery code to sign in. Google sign-in is unavailable for protected accounts.</p><div className="space-y-2"><Label htmlFor="securityPassword">Password for two-factor changes</Label><Input id="securityPassword" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={1024} disabled={pending} /></div>
      {setup && <div className="space-y-3"><p>Scan this QR code with your authenticator app, or enter the setup key manually.</p>
        {/* The QR is generated locally as a private data URL; it must not use an image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrDataUrl} width={256} height={256} alt="Authenticator setup QR code" className="max-w-full" />
        <p className="text-sm">Setup key: <code data-test="mfa-setup-key" className="break-all select-all">{setup.secret}</code></p><p className="text-xs text-muted-foreground">Setup expires at {new Date(setup.expiresAt).toLocaleTimeString()}.</p></div>}
      {(setup || status.enabled) && <div className="space-y-2"><Label htmlFor="securityCode">{setup ? 'Code from authenticator' : 'Authenticator or recovery code'}</Label><Input id="securityCode" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} maxLength={128} disabled={pending} /></div>}
      <div className="flex flex-wrap gap-2">{setup ? <><Button disabled={pending || !password || !code.trim()} onClick={() => void act('enable')}>Enable two-factor authentication</Button><Button variant="outline" disabled={pending || !password} onClick={() => void act('cancel')}>Cancel setup</Button></> : status.enabled ? <><Button variant="outline" disabled={pending || !password || !code.trim()} onClick={() => void act('recovery')}>Replace recovery codes</Button><Button variant="destructive" disabled={pending || !password || !code.trim()} onClick={() => void act('disable')}>Disable two-factor authentication</Button></> : <Button disabled={pending || !password} onClick={() => void act('begin')}>Set up authenticator</Button>}</div></div>}
  </CardContent></Card>
}
