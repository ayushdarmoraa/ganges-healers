'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import type { BlogSummary } from '@/lib/blog/admin'

export default function BlogManager() {
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<BlogSummary[]>([])
  const [counts, setCounts] = useState({ draft: 0, published: 0 })
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const more = useRef<AbortController | null>(null)
  const params = new URLSearchParams({ status, limit: '25' })
  if (search) params.set('q', search)
  const query = params.toString()

  useEffect(() => {
    const controller = new AbortController()
    more.current?.abort(); more.current = null
    setLoading(true); setLoadingMore(false); setRows([]); setCursor(null); setForbidden(false); setError(null)
    async function load() {
      try {
        const response = await fetch(`/api/admin/blog?${query}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401 || response.status === 403) { setForbidden(true); return }
        if (!response.ok) throw new Error()
        const body = await response.json()
        if (controller.signal.aborted) return
        if (!Array.isArray(body.data)) throw new Error()
        setRows(body.data); setCursor(body.nextCursor || null)
        if (body.counts) setCounts(body.counts)
      } catch { if (!controller.signal.aborted) setError('We couldn’t load the articles. Please try again.') }
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
      const response = await fetch(`/api/admin/blog?${next}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401 || response.status === 403) { setForbidden(true); return }
      if (!response.ok) throw new Error()
      const body = await response.json()
      if (controller.signal.aborted) return
      if (!Array.isArray(body.data)) throw new Error()
      const appended: BlogSummary[] = body.data
      setRows(previous => [...new Map([...previous, ...appended].map(row => [row.id, row])).values()])
      setCursor(body.nextCursor || null)
    } catch { if (!controller.signal.aborted) setError('More articles could not be loaded. Your current results are preserved; try Load More again.') }
    finally { if (!controller.signal.aborted) { more.current = null; setLoadingMore(false) } }
  }

  return <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
    <nav className="flex flex-wrap gap-3 text-sm"><Link href="/admin" className="text-primary underline">← Admin</Link><Link href="/admin/community" className="text-primary underline">Community Moderation</Link><Link href="/blog" className="text-primary underline">Public blog</Link></nav>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="text-3xl font-semibold">Manage Articles</h1><p className="text-muted-foreground">Write drafts, preview them, and choose when they become public.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh</Button><Button asChild><Link href="/admin/blog/new">New article</Link></Button></div></header>
    <div className="rounded-lg border p-4 space-y-3">
      <label className="inline-flex items-center gap-3 text-sm">Article status<select value={status} onChange={event => setStatus(event.target.value)} className="rounded-md border bg-background px-3 py-2"><option value="all">All ({counts.draft + counts.published})</option><option value="draft">Drafts ({counts.draft})</option><option value="published">Published ({counts.published})</option></select></label>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()) }}><label htmlFor="blog-admin-search" className="sr-only">Search articles</label><Input id="blog-admin-search" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={200} placeholder="Search title, summary, or content…" className="min-w-40 flex-1" /><Button type="submit" variant="outline">Search</Button>{search && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setSearchInput('') }}>Clear search</Button>}</form>
    </div>
    {error && <div role="alert" className="rounded-lg border p-4 space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
    {loading ? <p role="status" className="py-10 text-center text-muted-foreground">Loading articles…</p> : forbidden ? <p role="alert">Your account does not have access to manage articles.</p> : <div className="space-y-3">
      {!rows.length && !error && <p className="rounded-lg border p-8 text-center text-muted-foreground">No articles match these filters.</p>}
      {rows.map(row => <Card key={row.id} role="article" aria-labelledby={`blog-admin-${row.id}`}><CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap justify-between gap-3"><h2 id={`blog-admin-${row.id}`} className="text-lg font-semibold break-words"><Link href={`/admin/blog/${row.id}`} className="hover:underline">{row.title}</Link></h2><Badge variant={row.published ? 'outline' : 'secondary'}>{row.published ? 'Published' : 'Draft'}</Badge></div>
        {row.excerpt && <p className="text-sm text-muted-foreground break-words">{row.excerpt}</p>}
        <p className="text-xs text-muted-foreground break-all">/blog/{row.slug} · Updated {new Date(row.updatedAt).toLocaleString()}</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link href={`/admin/blog/${row.id}`} aria-label={`Edit ${row.title}`}>Edit article</Link></Button>{row.published && <Button size="sm" variant="ghost" asChild><Link href={`/blog/${encodeURIComponent(row.slug)}`} target="_blank" rel="noopener noreferrer">Open public article</Link></Button>}</div>
      </CardContent></Card>)}
    </div>}
    {cursor && !forbidden && <div className="text-center"><Button variant="outline" disabled={loadingMore || loading} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load More'}</Button></div>}
  </div>
}
