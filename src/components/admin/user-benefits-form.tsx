'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UserBenefitsInput, UserBenefitsRecord, UserBenefitsResult } from '@/lib/admin/user-benefits'

type Props = { actorId: string; label: string; user: UserBenefitsRecord; onSave: (input: UserBenefitsInput) => Promise<UserBenefitsResult> }

/** A session change unmounts drafts and prevents a late response reaching another administrator. */
export function UserBenefitsForm(props: Props) {
  const { data, status } = useSession()
  if (status === 'loading') return <p className="text-sm text-muted-foreground">Checking administrator access…</p>
  if (data?.user?.id !== props.actorId || data.user.role !== 'ADMIN') return null
  return <BenefitsEditor key={`${props.actorId}:${props.user.id}`} {...props} />
}

function BenefitsEditor({ label, user, onSave }: Props) {
  const [reviewed, setReviewed] = useState(user)
  const [vip, setVip] = useState(user.vip)
  const [credits, setCredits] = useState(String(user.freeSessionCredits))
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const busy = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const changed = vip !== reviewed.vip || Number(credits) !== reviewed.freeSessionCredits
  const validCredits = /^\d+$/.test(credits) && Number.isSafeInteger(Number(credits)) && Number(credits) <= 2147483647

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || stale || !changed) return
    if (!validCredits || !reason.trim() || reason.trim().length > 300) { setError('Enter a nonnegative whole-number balance and a reason for change.'); return }
    busy.current = true; setPending(true); setError(null); setMessage(null)
    try {
      const result = await onSave({ userId: reviewed.id, version: reviewed.version, vip, freeSessionCredits: Number(credits), reason: reason.trim() })
      if (!mounted.current) return
      if (!result.success) { setError(result.error); setStale(['USER_BENEFITS_CHANGED', 'USER_NOT_FOUND', 'FORBIDDEN'].includes(result.code)); return }
      setReviewed(result.user); setVip(result.user.vip); setCredits(String(result.user.freeSessionCredits)); setReason('')
      setMessage(result.changed ? 'Benefits saved.' : 'Benefits are already up to date.')
    } catch {
      if (mounted.current) setError('Benefits could not be saved. Your changes are still here; retry or reload the user list.')
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }

  return <form aria-label={`Benefits for ${label}`} aria-busy={pending} onSubmit={save} className="flex w-full flex-wrap items-end gap-3 md:w-auto">
    <div className="grid gap-1"><Label htmlFor={`vip-${user.id}`}>Manual VIP</Label><select id={`vip-${user.id}`} value={String(vip)} onChange={event => { setVip(event.target.value === 'true'); setMessage(null) }} disabled={pending || stale} className="h-9 rounded-md border bg-background px-2"><option value="false">No</option><option value="true">Yes</option></select></div>
    <div className="grid gap-1"><Label htmlFor={`credits-${user.id}`}>Free credits</Label><Input id={`credits-${user.id}`} type="number" min={0} max={2147483647} step={1} value={credits} onChange={event => { setCredits(event.target.value); setMessage(null) }} disabled={pending || stale} className="w-28" /></div>
    <div className="grid min-w-40 flex-1 gap-1"><Label htmlFor={`reason-${user.id}`}>Reason for change</Label><Input id={`reason-${user.id}`} maxLength={300} value={reason} onChange={event => setReason(event.target.value)} disabled={pending || stale} /></div>
    <Button type="submit" size="sm" disabled={pending || stale || !changed || !validCredits || !reason.trim()}>{pending ? 'Saving…' : 'Save benefits'}</Button>
    {error && <div className="w-full text-sm"><p role="alert" className="text-destructive">{error}</p>{stale && <a href="/admin" className="underline">Reload user list</a>}</div>}
    {message && <p role="status" className="w-full text-sm">{message}</p>}
  </form>
}
