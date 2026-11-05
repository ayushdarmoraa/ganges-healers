'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ProgramEnrollmentView } from '@/lib/programs/enrollments'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

type HealerOption = { id: string; name: string }
type Session = ProgramEnrollmentView['sessions'][number]
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: BOOKING_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' })
const statusLabels: Record<string, string> = { pending_payment: 'Payment pending', active: 'Active', completed: 'Completed', paused: 'Paused', cancelled: 'Cancelled' }
function dateLabel(value: string) { return `${dateFormat.format(new Date(value))} IST` }

export default function ProgramWorkspace({ items, healers = [] }: { items: ProgramEnrollmentView[]; healers?: HealerOption[] }) {
  if (!items.length) return <Card className="p-6"><p>No program enrollments found.</p><Link href="/programs" className="mt-2 inline-block underline">Browse programs</Link></Card>
  return <div className="space-y-6">{items.map(row => <ProgramCard key={`${row.id}:${row.healer?.id ?? ''}:${row.status}`} enrollment={row} healers={healers} />)}</div>
}
function ProgramCard({ enrollment: row, healers }: { enrollment: ProgramEnrollmentView; healers: HealerOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [healerId, setHealerId] = useState(row.healer?.id ?? '')
  function act(body: Record<string, unknown>) {
    setError(''); setMessage('')
    startTransition(async () => {
      try {
        const res = await fetch(`/api/program-enrollments/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not update the program')
        if (data?.success !== true || data?.data?.id !== row.id) throw new Error('The update could not be confirmed. Refresh your programs.')
        setMessage('Program updated.'); router.refresh()
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update the program') }
    })
  }
  return <Card data-test="program-enrollment" data-enrollment-id={row.id}><CardContent className="p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold"><Link href={`/programs/${encodeURIComponent(row.program.slug)}`}>{row.program.title}</Link></h2><p className="text-sm text-muted-foreground">{statusLabels[row.status] ?? row.status}{row.pricePaise !== null && ` · ₹${(row.pricePaise / 100).toFixed(2)}`}</p></div>{row.status === 'pending_payment' && <Button asChild variant="outline"><Link href={`/programs/${encodeURIComponent(row.program.slug)}`}>Continue checkout</Link></Button>}</div>
    {row.canManage && <p className="text-sm">Customer: {row.customerName}{row.customerEmail ? ` · ${row.customerEmail}` : ''}</p>}
    <p className="text-sm">Practitioner: {row.healer?.name ?? 'Awaiting assignment'}</p>
    {row.canAssign && row.status === 'active' && <div className="flex flex-wrap items-end gap-2"><div className="grid gap-1 text-sm"><label htmlFor={`practitioner-${row.id}`}>Assign practitioner</label><select id={`practitioner-${row.id}`} value={healerId} onChange={event => setHealerId(event.target.value)} disabled={pending} className="h-10 rounded-md border bg-background px-3"><option value="">Choose practitioner</option>{row.healer && !healers.some(healer => healer.id === row.healer?.id) && <option value={row.healer.id}>{row.healer.name}</option>}{healers.map(healer => <option key={healer.id} value={healer.id}>{healer.name} · {healer.id.slice(-6)}</option>)}</select></div><Button variant="outline" disabled={pending || !healerId} onClick={() => act({ action: 'assign', healerId })}>Assign practitioner</Button></div>}
    {row.needsReview ? <p role="alert" className="text-destructive">This enrollment’s purchased schedule needs staff review.</p> : row.totalSessions > 0 && <div><p className="text-sm">{row.completedSessions} of {row.totalSessions} sessions completed · {row.progressPercent}%</p><progress aria-label={`${row.program.title} progress`} value={row.completedSessions} max={row.totalSessions} className="mt-2 h-2 w-full accent-purple-600" /></div>}
    {row.canManage && (row.status === 'active' || row.status === 'paused') && <Button variant="outline" disabled={pending || row.status === 'active' && row.sessions.some(session => session.status === 'scheduled')} onClick={() => act({ action: row.status === 'paused' ? 'resume' : 'pause' })}>{row.status === 'paused' ? 'Resume program' : 'Pause program'}</Button>}
    {row.status === 'active' && <p className="text-sm text-muted-foreground">Suggested dates guide your program. Your practitioner confirms appointment times.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}
    <ol className="space-y-3">{row.sessions.map(session => <li key={`${session.sessionNumber}:${session.id}:${session.scheduledAt}:${session.status}`} className="rounded-lg border p-4 space-y-2"><h3 className="font-medium">Session {session.sessionNumber} · {session.durationMin} minutes</h3><p className="text-sm">{session.status === 'proposed' ? 'Awaiting confirmation' : session.status === 'scheduled' ? 'Confirmed' : session.status === 'completed' ? 'Completed' : 'Reservation cancelled'}</p>{session.scheduledAt ? <p className="text-sm">{dateLabel(session.scheduledAt)}</p> : <p className="text-sm text-muted-foreground">Suggested: {dateLabel(session.suggestedAt)}</p>}
      {session.id && session.scheduledAt && <div className="flex flex-wrap gap-3 text-sm"><a className="underline" href={`/api/program-enrollments/${encodeURIComponent(row.id)}/sessions/${session.sessionNumber}/calendar`}>{session.status === 'cancelled' ? 'Download cancellation' : 'Download calendar'}</a>{session.meetingLink && <a className="underline" href={session.meetingLink} rel="noopener noreferrer" target="_blank">Join session</a>}</div>}
      {row.status === 'paused' && row.canManage && session.status === 'scheduled' && <Button variant="outline" disabled={pending} onClick={() => act({ action: 'cancel', sessionNumber: session.sessionNumber })}>Cancel reservation</Button>}
      {row.status === 'active' && row.canManage && row.healer && session.status !== 'completed' && <SessionEditor enrollmentId={row.id} session={session} pending={pending} onAction={act} />}
    </li>)}</ol>
  </CardContent></Card>
}
function SessionEditor({ enrollmentId, session, pending, onAction }: { enrollmentId: string; session: Session; pending: boolean; onAction: (action: Record<string, unknown>) => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [meeting, setMeeting] = useState(session.meetingLink ?? '')
  const [slots, setSlots] = useState<Array<{ time: string; available: boolean }>>([])
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const number = session.sessionNumber
  useEffect(() => {
    setTime(''); setSlots([]); setError('')
    if (!date) { setChecking(false); return }
    const controller = new AbortController()
    setChecking(true)
    fetch(`/api/program-enrollments/${encodeURIComponent(enrollmentId)}/availability?${new URLSearchParams({ date, sessionNumber: String(number) })}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (!res.ok || body?.success !== true || !Array.isArray(body?.data?.slots)) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not check available times')
        if (!controller.signal.aborted) setSlots(body.data.slots.filter((slot: unknown): slot is { time: string; available: boolean } => !!slot && typeof slot === 'object' && 'time' in slot && typeof slot.time === 'string' && /^\d{2}:\d{2}$/.test(slot.time) && 'available' in slot && typeof slot.available === 'boolean'))
      }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not check available times') }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [date, enrollmentId, number, retry])
  const endPassed = !!session.scheduledAt && Date.parse(session.scheduledAt) + session.durationMin * 60000 <= Date.now()
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Date for session {number}<Input type="date" min={clinicDate(new Date())} value={date} onChange={event => setDate(event.target.value)} disabled={pending} /></label><div className="grid gap-1 text-sm"><label htmlFor={`program-time-${enrollmentId}-${number}`}>Time for session {number} (IST)</label><select id={`program-time-${enrollmentId}-${number}`} className="h-10 rounded-md border bg-background px-3" value={time} onChange={event => setTime(event.target.value)} disabled={pending || checking || !date}><option value="">Choose available time</option>{slots.filter(slot => slot.available).map(slot => <option key={slot.time} value={slot.time}>{slot.time}</option>)}</select></div><label className="grid gap-1 text-sm">Meeting link for session {number} (optional)<Input type="url" placeholder="https://" value={meeting} onChange={event => setMeeting(event.target.value)} disabled={pending} /></label><Button disabled={pending || checking || !date || !time || !slots.some(slot => slot.available && slot.time === time)} onClick={() => onAction({ action: 'schedule', sessionNumber: number, scheduledAt: clinicSlotInstant(date, time).toISOString(), meetingLink: meeting.trim() || null })}>{session.status === 'scheduled' ? 'Reschedule session' : 'Confirm session'}</Button></div>
    {checking && <p role="status" className="text-sm">Checking available times…</p>}{date && !checking && !error && slots.every(slot => !slot.available) && <p className="text-sm">No available times on this date.</p>}{error && <p role="alert" className="text-sm text-destructive">{error} <button className="underline" type="button" onClick={() => setRetry(value => value + 1)}>Retry availability</button></p>}
    {session.status === 'scheduled' && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => onAction({ action: 'cancel', sessionNumber: number })}>Cancel reservation</Button><Button variant="outline" disabled={pending || !endPassed} onClick={() => onAction({ action: 'complete', sessionNumber: number })}>Mark session completed</Button>{!endPassed && <span className="self-center text-xs text-muted-foreground">Completion opens after the reserved session ends.</span>}</div>}
  </div>
}
