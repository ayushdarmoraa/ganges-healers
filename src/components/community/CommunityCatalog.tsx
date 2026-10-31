'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CatalogItem, CatalogKind } from '@/lib/community/catalog'

type Editor = { kind: CatalogKind; item?: CatalogItem }
type Payload = Record<string, unknown>

function suggestedSlug(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '')
}

function CatalogEditor({ editor, onSave, onClose, onRefresh }: {
  editor: Editor
  onSave: (payload: Payload, create: boolean) => Promise<void>
  onClose: () => void
  onRefresh: () => void
}) {
  const { item, kind } = editor
  const [name, setName] = useState(item?.name || '')
  const [slug, setSlug] = useState(item?.slug || '')
  const [description, setDescription] = useState(item?.description || '')
  const [order, setOrder] = useState(String(item?.order ?? 0))
  const [active, setActive] = useState(true)
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const label = kind === 'topic' ? 'topic' : 'tag'

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(null); setConflict(false)
    try {
      const fields = { name: name.trim(), ...(kind === 'topic' ? { description: description.trim(), order: Number(order) } : {}) }
      const payload = item
        ? { kind, id: item.id, version: item.version, changes: fields }
        : { kind, ...fields, slug, ...(kind === 'topic' ? { isActive: active } : {}) }
      await onSave(payload, !item)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this item')
      setConflict(!!failure && typeof failure === 'object' && 'status' in failure && failure.status === 409)
    } finally { setSaving(false) }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
    <DialogContent showCloseButton={!saving} className="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{item ? 'Edit' : 'Create'} {label}</DialogTitle>
        <DialogDescription>{item ? 'Update the display details. The URL stays the same.' : 'Choose a clear name and permanent URL slug.'}</DialogDescription>
      </DialogHeader>
      <form id="community-catalog-editor" onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="catalog-name">{kind === 'topic' ? 'Topic name' : 'Tag name'}</Label>
          <Input id="catalog-name" value={name} required maxLength={100} disabled={saving} onChange={event => {
            setName(event.target.value)
            if (!item && !slugEdited) setSlug(suggestedSlug(event.target.value))
          }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-slug">URL slug</Label>
          <Input id="catalog-slug" value={slug} readOnly={!!item} disabled={saving} required maxLength={80} pattern={item ? undefined : '[a-z0-9]+(-[a-z0-9]+)*'} aria-describedby="catalog-slug-help" onChange={event => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()) }} />
          <p id="catalog-slug-help" className="text-xs text-muted-foreground break-all">{item ? 'This address is permanent: ' : 'Letters, numbers, and hyphens. Address: '}/community/{kind}/{slug || 'your-slug'}</p>
        </div>
        {kind === 'topic' && <>
          <div className="space-y-2"><Label htmlFor="catalog-description">Description</Label><textarea id="catalog-description" value={description} maxLength={1000} disabled={saving} onChange={event => setDescription(event.target.value)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
          <div className="space-y-2"><Label htmlFor="catalog-order">Display order</Label><Input id="catalog-order" type="number" value={order} required min={-1000000} max={1000000} step={1} disabled={saving} onChange={event => setOrder(event.target.value)} /><p className="text-xs text-muted-foreground">Lower numbers appear first. Ties use alphabetical order.</p></div>
          {!item && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} disabled={saving} onChange={event => setActive(event.target.checked)} />Make this topic active</label>}
        </>}
        {error && <div role="alert" className="rounded-lg border p-3 space-y-2"><p className="text-sm">{error}</p>{conflict && <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Close & refresh list</Button>}</div>}
      </form>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" form="community-catalog-editor" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : `Create ${label}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

export default function CommunityCatalog() {
  const [kind, setKind] = useState<CatalogKind>('topic')
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [toggle, setToggle] = useState<CatalogItem | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const more = useRef<AbortController | null>(null)
  const params = new URLSearchParams({ kind, limit: '25' })
  if (kind === 'topic') params.set('status', status)
  if (search) params.set('q', search)
  const query = params.toString()

  useEffect(() => {
    const controller = new AbortController()
    more.current?.abort(); more.current = null
    setLoading(true); setLoadingMore(false); setItems([]); setCursor(null); setError(null); setForbidden(false)
    async function load() {
      try {
        const response = await fetch(`/api/admin/community/catalog?${query}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401 || response.status === 403) { setForbidden(true); return }
        if (!response.ok) throw new Error()
        const body = await response.json()
        if (controller.signal.aborted) return
        if (!Array.isArray(body.data)) throw new Error()
        setItems(body.data); setCursor(body.nextCursor || null)
      } catch { if (!controller.signal.aborted) setError('We couldn’t load the catalog. Please try again.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => { controller.abort(); more.current?.abort(); more.current = null }
  }, [query, revision])

  async function loadMore() {
    if (!cursor || loading || more.current) return
    const controller = new AbortController()
    more.current = controller; setLoadingMore(true); setError(null)
    try {
      const next = new URLSearchParams(query); next.set('cursor', cursor)
      const response = await fetch(`/api/admin/community/catalog?${next}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401 || response.status === 403) { setForbidden(true); return }
      if (!response.ok) throw new Error()
      const body = await response.json()
      if (controller.signal.aborted) return
      if (!Array.isArray(body.data)) throw new Error()
      const rows: CatalogItem[] = body.data
      setItems(previous => [...new Map([...previous, ...rows].map(item => [item.id, item])).values()])
      setCursor(body.nextCursor || null)
    } catch { if (!controller.signal.aborted) setError('More items could not be loaded. Your current results are preserved; try Load More again.') }
    finally { if (!controller.signal.aborted) { more.current = null; setLoadingMore(false) } }
  }

  async function save(payload: Payload, create: boolean) {
    const response = await fetch('/api/admin/community/catalog', { method: create ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.error || 'Could not save this item'), { status: response.status })
    toast.success(body.idempotent ? 'This item is already up to date.' : create ? 'Created successfully.' : 'Changes saved.')
    setRevision(value => value + 1)
  }

  async function toggleTopic() {
    if (!toggle || toggling) return
    setToggling(true); setToggleError(null)
    try {
      await save({ kind: 'topic', id: toggle.id, version: toggle.version, changes: { isActive: !toggle.isActive } }, false)
      setToggle(null)
    } catch (failure) { setToggleError(failure instanceof Error ? failure.message : 'Could not change this topic') }
    finally { setToggling(false) }
  }

  function refresh() {
    setEditor(null); setToggle(null); setRevision(value => value + 1)
  }

  return <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
    <nav className="flex flex-wrap gap-3 text-sm"><Link href="/admin/community" className="text-primary underline">← Moderation</Link><Link href="/community/topics" className="text-primary underline">Topic directory</Link><Link href="/community/tags" className="text-primary underline">Tag directory</Link></nav>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2"><h1 className="text-3xl font-semibold">Community Topics & Tags</h1><p className="text-muted-foreground">Organize discussions and keep their addresses stable.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh}>Refresh</Button><Button disabled={forbidden} onClick={() => setEditor({ kind })}>Create {kind}</Button></div>
    </header>
    <div className="flex gap-2" aria-label="Catalog views">{(['topic', 'tag'] as const).map(view => <Button key={view} aria-pressed={kind === view} variant={kind === view ? 'default' : 'outline'} onClick={() => { setKind(view); setSearch(''); setSearchInput('') }}>{view === 'topic' ? 'Topics' : 'Tags'}</Button>)}</div>
    <div className="rounded-lg border p-4 space-y-3">
      {kind === 'topic' && <label className="inline-flex items-center gap-3 text-sm">Topic status<select value={status} onChange={event => setStatus(event.target.value)} className="rounded-md border bg-background px-3 py-2"><option value="all">All topics</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()) }}><Label htmlFor="catalog-search" className="sr-only">Search topics or tags</Label><Input id="catalog-search" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={200} placeholder="Search name or URL slug…" className="min-w-40 flex-1" /><Button type="submit" variant="outline">Search</Button>{search && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setSearchInput('') }}>Clear search</Button>}</form>
      <p className="text-xs text-muted-foreground">Discussion counts include hidden discussions. Deactivation removes a topic from the directory and new-post choices; existing discussions remain available in feeds and at their direct addresses.</p>
    </div>
    {error && <div role="alert" className="rounded-lg border p-4 space-y-2"><p>{error}</p><Button variant="outline" onClick={refresh}>Try again</Button></div>}
    {loading ? <p role="status" className="py-10 text-center text-muted-foreground">Loading community catalog…</p> : forbidden ? <p role="alert">Your account does not have access to manage community topics and tags.</p> : <div className="space-y-3">
      {!items.length && !error && <p className="rounded-lg border p-8 text-center text-muted-foreground">No {kind === 'topic' ? 'topics' : 'tags'} match these filters.</p>}
      {items.map(item => <Card key={item.id} role="article" aria-labelledby={`catalog-item-${item.id}`}><CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={`catalog-item-${item.id}`} className="text-lg font-semibold break-words">{item.name}</h2>{item.kind === 'topic' && <Badge variant={item.isActive ? 'outline' : 'secondary'}>{item.isActive ? 'Active' : 'Inactive'}</Badge>}</div>
        {item.description && <p className="text-sm whitespace-pre-wrap break-words">{item.description}</p>}
        <p className="text-xs text-muted-foreground break-all">/community/{item.kind}/{item.slug}</p>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>{item.postCount} linked {item.postCount === 1 ? 'discussion' : 'discussions'}</span>{item.kind === 'topic' && <span>Display order: {item.order}</span>}</div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-label={`Edit ${item.name}`} onClick={() => setEditor({ kind: item.kind, item })}>Edit</Button>{item.kind === 'topic' && <Button size="sm" variant="outline" aria-label={`${item.isActive ? 'Deactivate' : 'Activate'} ${item.name}`} onClick={() => { setToggleError(null); setToggle(item) }}>{item.isActive ? 'Deactivate topic' : 'Activate topic'}</Button>}{(item.kind === 'tag' || item.isActive) && <Button size="sm" variant="ghost" asChild><Link href={`/community/${item.kind}/${encodeURIComponent(item.slug)}`}>Open {item.kind}</Link></Button>}</div>
      </CardContent></Card>)}
    </div>}
    {cursor && !forbidden && <div className="text-center"><Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore || loading}>{loadingMore ? 'Loading…' : 'Load More'}</Button></div>}
    {editor && <CatalogEditor key={`${editor.kind}:${editor.item?.id || 'new'}`} editor={editor} onSave={save} onClose={() => setEditor(null)} onRefresh={refresh} />}
    <Dialog open={!!toggle} onOpenChange={open => { if (!open && !toggling) setToggle(null) }}><DialogContent showCloseButton={!toggling}>
      {toggle && <><DialogHeader><DialogTitle>{toggle.isActive ? 'Deactivate' : 'Activate'} {toggle.name}?</DialogTitle><DialogDescription>{toggle.isActive ? 'This removes the topic from the directory and new-post choices. Its existing discussions and permanent addresses are preserved.' : 'This returns the topic to the directory and lets members choose it for new discussions.'}</DialogDescription></DialogHeader><p className="text-sm">{toggle.postCount} linked discussions will be preserved.</p>{toggleError && <div role="alert" className="rounded-lg border p-3 space-y-2"><p>{toggleError}</p><Button size="sm" variant="outline" onClick={refresh}>Close & refresh list</Button></div>}<DialogFooter><Button variant="outline" disabled={toggling} onClick={() => setToggle(null)}>Cancel</Button><Button disabled={toggling} onClick={() => void toggleTopic()}>{toggling ? 'Saving…' : toggle.isActive ? 'Confirm deactivation' : 'Confirm activation'}</Button></DialogFooter></>}
    </DialogContent></Dialog>
  </div>
}
