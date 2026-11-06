'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { BOOKING_TIME_ZONE } from '@/lib/bookings/time'
import { healerBookingCapabilities, safeMeetingLink } from '@/lib/bookings/session-delivery'

interface Booking {
  id: string; scheduledAt: string; durationMin: number; status: string; pricePaise: number; updatedAt: string; meetingLink: string | null
  user: { id: string; name: string | null; email: string; image: string | null }
  service: { name: string; category: string; slug: string; duration: number }
  payment: { status: string; amountPaise: number; statusEnum: string | null; gateway?: string } | null
}
type Action = { action: 'CONFIRM' | 'CANCEL' | 'COMPLETE' } | { action: 'SET_MEETING_LINK'; meetingLink: string | null; version: string }
const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = { PENDING: 'outline', SCHEDULED: 'secondary', CONFIRMED: 'default', RESCHEDULED: 'secondary', COMPLETED: 'default', CANCELLED: 'destructive' }
function clinicTime(value: string) { return new Intl.DateTimeFormat('en-IN', { timeZone: BOOKING_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function isBooking(value: unknown): value is Booking {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<Booking>
  return typeof row.id === 'string' && !!row.id && typeof row.scheduledAt === 'string' && Number.isFinite(Date.parse(row.scheduledAt))
    && typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt)) && typeof row.status === 'string'
    && typeof row.durationMin === 'number' && typeof row.pricePaise === 'number' && !!row.service && !!row.user
    && typeof row.service.name === 'string' && typeof row.user.email === 'string' && (row.meetingLink === null || typeof row.meetingLink === 'string')
    && (row.payment === null || !!row.payment && typeof row.payment.status === 'string' && typeof row.payment.amountPaise === 'number' && (row.payment.statusEnum == null || typeof row.payment.statusEnum === 'string'))
}

export default function HealerBookingsPage() {
  const { data: session, status } = useSession()
  const ownerId = session?.user?.role === 'HEALER' ? session.user.id ?? '' : ''
  const owner = useRef(ownerId); owner.current = ownerId
  const live = useRef(true), controller = useRef<AbortController | null>(null), pending = useRef(false), actionVersion = useRef(0)
  const [snapshot, setSnapshot] = useState<{ owner: string; rows: Booking[] } | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [acting, setActing] = useState('')
  const [now, setNow] = useState(Date.now), [cancelling, setCancelling] = useState<Booking | null>(null)
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort() } }, [])
  useEffect(() => { actionVersion.current++; pending.current = false; setActing('') }, [ownerId])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const fetchBookings = useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request
    setLoading(true); setError(''); setSnapshot(null); setCancelling(null)
    if (status === 'loading') return
    if (!ownerId) { setLoading(false); setError('Sign in with your healer account to view bookings.'); return }
    try {
      const response = await fetch('/api/healer/bookings', { cache: 'no-store', signal: request.signal })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load bookings')
      if (body?.success !== true || !Array.isArray(body.data) || !body.data.every(isBooking)) throw new Error('Saved bookings could not be confirmed. Please retry.')
      if (!request.signal.aborted && owner.current === ownerId) setSnapshot({ owner: ownerId, rows: body.data })
    } catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Failed to load bookings') }
    finally { if (!request.signal.aborted && live.current) setLoading(false) }
  }, [ownerId, status])
  useEffect(() => { void fetchBookings(); return () => { controller.current?.abort() } }, [fetchBookings])

  const act = async (booking: Booking, input: Action): Promise<string | null> => {
    if (pending.current || !ownerId) return 'Another booking action is still being saved.'
    const actor = ownerId, version = ++actionVersion.current; pending.current = true; setActing(booking.id + input.action)
    try {
      const response = await fetch(`/api/healer/bookings/${encodeURIComponent(booking.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Action failed. Please retry.')
      const row = body?.data
      if (body?.success !== true || row?.id !== booking.id || typeof row.status !== 'string' || !(row.status in statusColor) || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)) || (row.meetingLink !== null && typeof row.meetingLink !== 'string')) throw new Error('The booking change was not confirmed. Reload the saved booking before trying again.')
      if (live.current && owner.current === actor && actionVersion.current === version) {
        setSnapshot(previous => previous?.owner === actor ? { owner: actor, rows: previous.rows.map(value => value.id === booking.id ? { ...value, status: row.status, updatedAt: row.updatedAt, meetingLink: row.meetingLink } : value) } : previous)
        setCancelling(null)
        toast.success(input.action === 'SET_MEETING_LINK' ? row.meetingLink ? 'Session link saved' : 'Session link removed' : input.action === 'COMPLETE' ? 'Session marked completed' : input.action === 'CONFIRM' ? 'Booking confirmed' : 'Booking cancelled')
      }
      return null
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Action failed'
      if (live.current && owner.current === actor && input.action !== 'SET_MEETING_LINK') toast.error(message)
      return message
    } finally { if (actionVersion.current === version) { pending.current = false; if (live.current && owner.current === actor) setActing('') } }
  }
  const bookings = snapshot?.owner === ownerId ? snapshot.rows : []
  const ended = (booking: Booking) => Date.parse(booking.scheduledAt) + booking.durationMin * 60000 <= now
  const terminal = (booking: Booking) => ['CANCELLED', 'COMPLETED'].includes(booking.status)
  const upcoming = bookings.filter(booking => !ended(booking) && !terminal(booking))
  const past = bookings.filter(booking => ended(booking) || terminal(booking))
  const waiting = bookings.filter(booking => booking.status === 'PENDING')
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Manage Bookings</h1><p className="mt-2 text-sm text-muted-foreground">Session times are shown in India time (IST). Add your meeting link for the customer and their calendar.</p></div><Button variant="outline" disabled={!!acting || loading} onClick={() => void fetchBookings()}>Reload saved bookings</Button></div>
    {error && <div role="alert" className="rounded border p-4 space-y-2"><p>{error}</p><Button variant="outline" onClick={() => void fetchBookings()}>Retry bookings</Button></div>}
    {loading ? <div role="status" className="flex justify-center py-20"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" /><span className="sr-only">Loading bookings</span></div> : !error && <Tabs defaultValue="upcoming"><TabsList><TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger><TabsTrigger value="pending">Pending ({waiting.length})</TabsTrigger><TabsTrigger value="past">Past ({past.length})</TabsTrigger></TabsList>
      {[{ key: 'upcoming', rows: upcoming }, { key: 'pending', rows: waiting }, { key: 'past', rows: past }].map(tab => <TabsContent key={tab.key} value={tab.key} className="mt-4"><BookingList bookings={tab.rows} now={now} busy={!!acting} onAction={act} onCancel={setCancelling} onReload={() => void fetchBookings()} /></TabsContent>)}
    </Tabs>}
    <Dialog open={!!cancelling} onOpenChange={open => { if (!acting && !open) setCancelling(null) }}><DialogContent><DialogHeader><DialogTitle>Cancel this unpaid booking?</DialogTitle><DialogDescription>Release the reserved time for {cancelling?.user.name || cancelling?.user.email}. Confirmed payments and used session credits need separate cancellation review.</DialogDescription></DialogHeader><div className="flex gap-3"><Button variant="outline" disabled={!!acting} onClick={() => setCancelling(null)}>Keep booking</Button><Button variant="destructive" disabled={!!acting} onClick={() => { if (cancelling) void act(cancelling, { action: 'CANCEL' }) }}>Cancel unpaid booking</Button></div></DialogContent></Dialog>
  </div>
}

function BookingList({ bookings, now, busy, onAction, onCancel, onReload }: { bookings: Booking[]; now: number; busy: boolean; onAction: (booking: Booking, action: Action) => Promise<string | null>; onCancel: (booking: Booking) => void; onReload: () => void }) {
  if (!bookings.length) return <Card><CardContent className="py-8 text-center text-muted-foreground">No bookings</CardContent></Card>
  return <div className="space-y-3">{bookings.map(booking => {
    const can = healerBookingCapabilities(booking, now), meeting = safeMeetingLink(booking.meetingLink)
    return <Card key={booking.id}><CardContent className="py-4 space-y-4"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="space-y-1"><p className="font-medium">{booking.user.name || booking.user.email}</p><p className="text-sm text-muted-foreground">{booking.service.name}</p><p className="text-sm text-muted-foreground">{clinicTime(booking.scheduledAt)} IST · {booking.durationMin} min</p><a className="text-sm underline" href={`/api/bookings/${encodeURIComponent(booking.id)}/calendar`}>Download calendar</a></div>
      <div className="space-y-2"><Badge variant={statusColor[booking.status] ?? 'outline'}>{booking.status}</Badge>{booking.payment && <p className="text-xs">{booking.payment.gateway === 'vip_credit' ? 'Session credit applied' : `Payment: ${booking.payment.status} · ₹${(booking.payment.amountPaise / 100).toLocaleString('en-IN')}`}</p>}
        <div className="flex flex-wrap gap-2">{['PENDING', 'SCHEDULED'].includes(booking.status) && <Button size="sm" disabled={busy || !can.canConfirm} onClick={() => void onAction(booking, { action: 'CONFIRM' })}>Confirm</Button>}{['CONFIRMED', 'RESCHEDULED'].includes(booking.status) && <Button size="sm" disabled={busy || !can.canComplete} title={!can.canComplete ? 'Available after the scheduled session ends' : undefined} onClick={() => void onAction(booking, { action: 'COMPLETE' })}>Complete session</Button>}{can.canCancel && <Button size="sm" variant="destructive" disabled={busy} onClick={() => onCancel(booking)}>Cancel unpaid booking</Button>}</div>
        {['PENDING', 'SCHEDULED'].includes(booking.status) && !can.canConfirm && <p className="text-xs text-muted-foreground">Confirmation requires an upcoming session with verified payment, an applied credit, or a free booking.</p>}
        {can.cancellationNeedsReview && <p className="max-w-sm text-xs text-muted-foreground">Paid sessions and used credits require administrator review before practitioner cancellation.</p>}
      </div></div>
      {meeting && ['CONFIRMED', 'RESCHEDULED'].includes(booking.status) && <a className="inline-flex rounded border px-3 py-2 text-sm underline" href={meeting} target="_blank" rel="noopener noreferrer">Join session</a>}
      {can.canSetMeetingLink && <SessionLinkEditor booking={booking} disabled={busy} onSave={link => onAction(booking, { action: 'SET_MEETING_LINK', meetingLink: link, version: booking.updatedAt })} onReload={onReload} />}
    </CardContent></Card>
  })}</div>
}

function SessionLinkEditor({ booking, disabled, onSave, onReload }: { booking: Booking; disabled: boolean; onSave: (value: string | null) => Promise<string | null>; onReload: () => void }) {
  const [draft, setDraft] = useState(booking.meetingLink ?? ''), [error, setError] = useState('')
  const label = `Session link for ${booking.service.name}`
  useEffect(() => { setDraft(booking.meetingLink ?? ''); setError('') }, [booking.id, booking.updatedAt, booking.meetingLink])
  return <form className="space-y-2" onSubmit={event => {
    event.preventDefault(); setError('')
    const link = draft.trim() ? safeMeetingLink(draft) : null
    if (draft.trim() && !link) { setError('Use an HTTPS meeting URL without embedded credentials.'); return }
    void onSave(link).then(message => { if (message) setError(message) })
  }}>
    <label className="grid gap-1 text-sm">{label}<Input type="url" maxLength={2000} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} /></label>
    <p className="text-xs text-muted-foreground">Paste the link for this appointment. Leaving it empty removes the saved link.</p>
    <Button size="sm" variant="outline" type="submit" disabled={disabled || draft.trim() === (booking.meetingLink ?? '')}>Save session link</Button>
    {error && <div role="alert" className="space-y-2"><p className="text-sm">{error}</p><Button type="button" variant="ghost" disabled={disabled} onClick={onReload}>Discard link draft and reload bookings</Button></div>}
  </form>
}
