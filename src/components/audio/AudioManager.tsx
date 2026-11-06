'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { audioDetailSchema, audioSummarySchema, audioFieldsSchema, createAudioSchema, type AudioChange, type AudioDetail, type AudioFields, type AudioSummary } from '@/lib/audio/admin-schema'

const listSchema = z.object({ success: z.literal(true), data: z.array(audioSummarySchema), nextCursor: z.string().nullable() })
const detailSchema = z.object({ success: z.literal(true), data: audioDetailSchema })
const empty = { title: '', slug: '', description: '', category: '', audioUrl: '', duration: 300, isPremium: false }
class AudioResponseError extends Error {}
async function responseBody(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new AudioResponseError(typeof body?.error === 'string' ? body.error : 'Audio management is unavailable. Please retry.'), { code: body?.code || (response.status === 403 ? 'FORBIDDEN' : undefined) })
  return body
}
/** Account-bound drafts and requests cannot continue in another administrator's session. */
export default function AudioManager() {
  const { data, status } = useSession()
  if (status === 'loading') return <p className="container mx-auto p-6">Checking administrator access…</p>
  if (!data?.user?.id || data.user.role !== 'ADMIN') return <p className="container mx-auto p-6">Sign in with an administrator account.</p>
  return <AudioWorkspace key={data.user.id} />
}
function AudioWorkspace() {
  const [rows, setRows] = useState<AudioSummary[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState('')
  const [selected, setSelected] = useState(''), [creating, setCreating] = useState(false), [revision, setRevision] = useState(0), [notice, setNotice] = useState('')
  const more = useRef<AbortController | null>(null)
  const params = new URLSearchParams({ q: query, status, limit: '25' }).toString()
  useEffect(() => {
    const controller = new AbortController(); more.current?.abort(); more.current = null
    setRows([]); setCursor(null); setLoading(true); setLoadingMore(false); setError('')
    fetch(`/api/admin/audio?${params}`, { signal: controller.signal, cache: 'no-store' }).then(responseBody).then(body => {
      const parsed = listSchema.parse(body)
      if (!controller.signal.aborted) { setRows(parsed.data); setCursor(parsed.nextCursor) }
    }).catch(() => { if (!controller.signal.aborted) setError('Audio tracks could not be loaded. Please retry.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); more.current?.abort(); more.current = null }
  }, [params, revision])
  async function loadMore() {
    if (!cursor || loading || more.current) return
    const controller = new AbortController(); more.current = controller; setLoadingMore(true); setError('')
    try {
      const next = new URLSearchParams(params); next.set('cursor', cursor)
      const parsed = listSchema.parse(await responseBody(await fetch(`/api/admin/audio?${next}`, { signal: controller.signal, cache: 'no-store' })))
      if (!controller.signal.aborted) { setRows(previous => [...new Map([...previous, ...parsed.data].map(row => [row.id, row])).values()]); setCursor(parsed.nextCursor) }
    } catch { if (!controller.signal.aborted) setError('More audio tracks could not be loaded. Your current results are preserved; retry.') }
    finally { if (!controller.signal.aborted) { more.current = null; setLoadingMore(false) } }
  }
  return <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
    <nav className="flex gap-4 text-sm"><Link href="/admin" className="underline">← Admin</Link><Link href="/audio" className="underline">Audio library</Link></nav>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Manage Audio</h1><p className="mt-2 text-muted-foreground">Save a private draft, review its details, and publish when your audio is ready.</p></div><Button disabled={!!selected || creating} onClick={() => { setCreating(true); setNotice('') }}>New audio track</Button></header>
    {notice && <p role="status">{notice}</p>}
    {(creating || selected) && <AudioEditor key={selected || 'new'} id={selected || undefined} onClose={() => { setCreating(false); setSelected('') }} onSaved={(row, created) => { if (created) { setSelected(row.id); setCreating(false); setNotice('Audio draft created.') }; setRevision(value => value + 1) }} />}
    <form onSubmit={event => { event.preventDefault(); setQuery(search.trim()) }} className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Search audio<Input value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label><label className="grid gap-1 text-sm">Audio status<select value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3"><option value="all">All</option><option value="draft">Drafts and withdrawn</option><option value="published">Published</option></select></label><Button type="submit" variant="outline">Search</Button>{query && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQuery('') }}>Clear search</Button>}</form>
    {error && <div role="alert" className="space-y-2 rounded border p-4"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry audio list</Button></div>}
    {loading ? <p role="status">Loading audio…</p> : <div className="space-y-3">{rows.length === 0 && <p>No audio tracks match these filters.</p>}{rows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h2 className="font-semibold">{row.title}</h2><p className="text-sm text-muted-foreground">{row.category} · {row.duration} seconds · {row.isPremium ? 'Premium' : 'Free'} · {row.isPublished ? 'Published' : 'Draft / withdrawn'}</p></div><Button variant="outline" disabled={creating || !!selected} onClick={() => { setSelected(row.id); setNotice('') }}>Edit {row.title}</Button></article>)}{cursor && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading more…' : 'Load more audio'}</Button>}</div>}
  </div>
}
function AudioEditor({ id, onClose, onSaved }: { id?: string; onClose: () => void; onSaved: (row: AudioDetail, created: boolean) => void }) {
  const [track, setTrack] = useState<AudioDetail | null>(null), [fields, setFields] = useState(empty), [duration, setDuration] = useState('300')
  const [loading, setLoading] = useState(!!id), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [revision, setRevision] = useState(0)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const live = useRef(true), submitting = useRef(false), mutation = useRef<AbortController | null>(null)
  useEffect(() => { live.current = true; return () => { live.current = false; mutation.current?.abort() } }, [])
  function accept(row: AudioDetail) { setTrack(row); setFields({ ...row, description: row.description || '' }); setDuration(String(row.duration)) }
  useEffect(() => {
    if (!id) return
    const controller = new AbortController(); setLoading(true); setError('')
    fetch(`/api/admin/audio?id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' }).then(responseBody).then(body => {
      const parsed = detailSchema.parse(body)
      if (parsed.data.id !== id) throw new Error('Saved audio could not be confirmed')
      if (!controller.signal.aborted) { accept(parsed.data); setConflict(false) }
    }).catch(() => { if (!controller.signal.aborted) setError('The saved track could not be confirmed. Please retry.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, revision])
  const details: AudioFields = { title: fields.title, description: fields.description, category: fields.category, audioUrl: fields.audioUrl, duration: Number(duration), isPremium: fields.isPremium }
  const dirty = !track || JSON.stringify(details) !== JSON.stringify({ title: track.title, description: track.description || '', category: track.category, audioUrl: track.audioUrl, duration: track.duration, isPremium: track.isPremium })
  async function act(change?: AudioChange) {
    if (submitting.current || conflict || loading) return
    if (!change) {
      const valid = track ? audioFieldsSchema.safeParse(details) : createAudioSchema.safeParse({ ...details, slug: fields.slug })
      if (!valid.success || !/^\d+$/.test(duration)) { setError(valid.success ? 'Enter a whole duration in seconds.' : valid.error.issues[0]?.message || 'Check the audio fields.'); return }
      change = { action: 'details', fields: details }
    }
    submitting.current = true; setBusy(true); setError(''); setMessage('')
    const controller = new AbortController(); mutation.current = controller
    try {
      const body = await responseBody(await fetch('/api/admin/audio', { method: track ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(track ? { id: track.id, version: track.version, change } : { ...details, slug: fields.slug }) }))
      const parsed = detailSchema.parse(body)
      if (track && parsed.data.id !== track.id || !track && parsed.data.isPublished) throw new Error('The saved draft could not be confirmed.')
      if (!live.current) return
      const created = !track; accept(parsed.data); onSaved(parsed.data, created); setMessage(change.action === 'publish' ? 'Audio published.' : change.action === 'withdraw' ? 'Audio withdrawn.' : 'Audio saved.')
    } catch (failure) {
      if (!live.current) return
      if (failure && typeof failure === 'object' && 'code' in failure && ['AUDIO_CHANGED', 'TRACK_NOT_FOUND', 'FORBIDDEN'].includes(String(failure.code))) setConflict(true)
      setError(failure instanceof AudioResponseError ? failure.message : 'The save was not confirmed. Your draft is preserved; retry or reload before trying again.')
    } finally { submitting.current = false; if (live.current) setBusy(false) }
  }
  return <section className="space-y-4 rounded-lg border p-4" aria-label="Audio editor">
    <h2 className="text-xl font-semibold">{id ? 'Edit audio track' : 'New audio draft'}</h2>
    {error && <p role="alert" className="text-destructive">{error}</p>}{message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading saved track…</p> : <form aria-label="Audio details" onSubmit={event => { event.preventDefault(); void act() }}>
      <fieldset disabled={busy || conflict || !!id && !track} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1"><Label htmlFor="audio-title">Track title</Label><Input id="audio-title" value={fields.title} maxLength={200} onChange={event => setFields(value => ({ ...value, title: event.target.value }))} required /></div>
        <div className="grid gap-1"><Label htmlFor="audio-slug">URL slug</Label><Input id="audio-slug" value={fields.slug} maxLength={100} disabled={!!track} onChange={event => setFields(value => ({ ...value, slug: event.target.value }))} required /></div>
        <div className="grid gap-1 sm:col-span-2"><Label htmlFor="audio-description">Description</Label><textarea id="audio-description" value={fields.description} maxLength={20000} onChange={event => setFields(value => ({ ...value, description: event.target.value }))} className="min-h-28 rounded-md border bg-background p-3" /></div>
        <div className="grid gap-1"><Label htmlFor="audio-category">Category</Label><Input id="audio-category" value={fields.category} maxLength={80} onChange={event => setFields(value => ({ ...value, category: event.target.value }))} required /></div>
        <div className="grid gap-1"><Label htmlFor="audio-duration">Duration (seconds)</Label><Input id="audio-duration" type="number" min={1} max={86400} step={1} value={duration} onChange={event => setDuration(event.target.value)} required /></div>
        <div className="grid gap-1 sm:col-span-2"><Label htmlFor="audio-url">Audio URL</Label><Input id="audio-url" type="url" value={fields.audioUrl} maxLength={2000} onChange={event => setFields(value => ({ ...value, audioUrl: event.target.value }))} /><p className="text-xs text-muted-foreground">Use a playable HTTPS link for audio you’re allowed to share. You can leave it empty in a draft.</p></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={fields.isPremium} onChange={event => setFields(value => ({ ...value, isPremium: event.target.checked }))} />Premium audio</label>
        <Button type="submit" disabled={!dirty}>{busy ? 'Saving…' : track ? 'Save audio details' : 'Save audio draft'}</Button>
      </fieldset>
    </form>}
    {track && <div className="flex flex-wrap items-center gap-3"><p className="text-sm">{track.isPublished ? 'Published' : 'Draft / withdrawn'}{dirty ? ' · Save or discard changes before publishing or withdrawing.' : ''}</p><Button disabled={busy || loading || conflict || dirty} variant="outline" onClick={() => void act({ action: track.isPublished ? 'withdraw' : 'publish' })}>{track.isPublished ? 'Withdraw audio' : 'Publish audio'}</Button></div>}
    <div className="flex flex-wrap gap-3">{id && <Button variant="outline" disabled={busy || loading} onClick={() => { setMessage(''); setRevision(value => value + 1) }}>Reload saved track and discard changes</Button>}<Button variant="ghost" disabled={busy} onClick={onClose}>{dirty ? 'Discard unsaved changes' : 'Close editor'}</Button></div>
  </section>
}
