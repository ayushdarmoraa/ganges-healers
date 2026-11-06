'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { DAY_LABELS, END_TIMES, readWeeklyAvailability, START_TIMES, timeToMinutes, WEEK_DAYS, weeklyAvailabilitySchema, type WeeklySchedule, type WeekDay } from '@/lib/bookings/availability-rules'

type Snapshot = { owner: string; schedule: WeeklySchedule; etag: string }
const DEFAULT_WINDOW = { start: '10:00', end: '18:00' }
function readSnapshot(body: unknown, etag: string | null, owner: string): Snapshot {
  const result = body as { success?: unknown; data?: unknown; version?: unknown } | null
  const schedule = result?.success === true && result.data != null ? readWeeklyAvailability(result.data) : null
  etag ??= typeof result?.version === 'string' ? result.version : null
  if (!schedule || !etag || !/^"availability-[a-f0-9]{64}"$/.test(etag)) throw new Error('Saved availability could not be confirmed. Please reload it.')
  return { owner, schedule, etag }
}
function timeOptions(choices: string[], current: string) { return choices.includes(current) ? choices : [current, ...choices].sort() }

export default function AvailabilityEditorPage() {
  const { data: session, status } = useSession()
  const userId = session?.user?.id ?? ''
  const owner = useRef(userId)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    owner.current = userId
    setSnapshot(null); setError(''); setConflict(false); setSaving(false)
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/healer/availability', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load availability')
      const saved = readSnapshot(body, response.headers.get('etag'), userId)
      if (!controller.signal.aborted) setSnapshot(saved)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Failed to load availability') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [userId, reload])
  const owned = snapshot?.owner === userId ? snapshot : null
  function toggleDay(day: WeekDay) {
    setSnapshot(previous => previous?.owner === userId ? { ...previous, schedule: { ...previous.schedule, [day]: previous.schedule[day] ? null : { ...DEFAULT_WINDOW } } } : previous)
  }
  function updateTime(day: WeekDay, field: 'start' | 'end', value: string) {
    setSnapshot(previous => previous?.owner === userId && previous.schedule[day] ? { ...previous, schedule: { ...previous.schedule, [day]: { ...previous.schedule[day]!, [field]: value } } } : previous)
  }
  async function save() {
    if (!owned || saving || conflict) return
    const parsed = weeklyAvailabilitySchema.safeParse(owned.schedule)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check your weekly hours'); return }
    const actor = userId
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/healer/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': owned.etag }, body: JSON.stringify(parsed.data) })
      const body = await response.json().catch(() => null)
      if (owner.current !== actor) return
      if (response.status === 412) setConflict(true)
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Save failed')
      setSnapshot(readSnapshot(body, response.headers.get('etag'), actor))
      toast.success('Availability saved')
    } catch (failure) { if (owner.current === actor) setError(failure instanceof Error ? failure.message : 'Save failed') }
    finally { if (owner.current === actor) setSaving(false) }
  }
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Edit Availability</h1><Card><CardHeader><CardTitle>Weekly Schedule</CardTitle><CardDescription>Set your weekly hours in India time (IST, Asia/Kolkata), using 30-minute increments. 24:00 means midnight at the end of that day. Existing appointments keep their reserved times.</CardDescription></CardHeader><CardContent className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {status === 'loading' || loading ? <p role="status">Loading availability…</p>
      : !userId ? <p>Sign in as a healer to manage availability.</p>
      : !owned ? <Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry loading availability</Button>
      : <>{WEEK_DAYS.map(day => {
        const window = owned.schedule[day]
        const count = window ? Math.max(0, Math.floor((timeToMinutes(window.end) - timeToMinutes(window.start)) / 30)) : 0
        return <div key={day} className="flex flex-col gap-3 border-b py-3 last:border-0 sm:flex-row sm:items-center"><div className="flex min-w-[140px] items-center gap-3"><button type="button" role="switch" aria-label={`${DAY_LABELS[day]} availability`} aria-checked={!!window} disabled={saving} onClick={() => toggleDay(day)} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${window ? 'bg-primary' : 'bg-muted'}`}><span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${window ? 'translate-x-5' : 'translate-x-0'}`} /></button><span className="text-sm font-medium">{DAY_LABELS[day]}</span></div>
          {window ? <div className="flex flex-wrap items-center gap-2"><label htmlFor={`${day}-start`} className="sr-only">{DAY_LABELS[day]} start</label><select id={`${day}-start`} value={window.start} disabled={saving} onChange={event => updateTime(day, 'start', event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">{timeOptions(START_TIMES, window.start).map(time => <option key={time} value={time}>{time}</option>)}</select><span className="text-sm text-muted-foreground">to</span><label htmlFor={`${day}-end`} className="sr-only">{DAY_LABELS[day]} end</label><select id={`${day}-end`} value={window.end} disabled={saving} onChange={event => updateTime(day, 'end', event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">{timeOptions(END_TIMES, window.end).map(time => <option key={time} value={time}>{time}</option>)}</select><span className="text-xs text-muted-foreground">{count} half-hour intervals</span></div> : <span className="text-sm text-muted-foreground">Day off</span>}</div>
      })}<p className="text-sm text-muted-foreground">Appointment length and existing reservations determine which start times customers can book.</p>
      {conflict && <p className="text-sm">Your draft is kept. Reload saved hours before saving again; reloading replaces this draft.</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving || conflict}>{saving ? 'Saving…' : 'Save Availability'}</Button><Button variant="outline" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload saved hours</Button></div></>}
  </CardContent></Card></div>
}
