'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NotificationItem, NotificationList } from '@/lib/notifications/types'
import { useNotifications } from './NotificationProvider'

/** Paginated account history; summary refreshes never silently discard already loaded pages. */
export default function NotificationInbox() {
  const { ownerId, unreadCount, notifications, status: summaryStatus, refresh: refreshSummary, markRead, markAllRead, pendingIds, markingAll, actionError, changeVersion, sessionLoading } = useNotifications()
  const [filter, setFilter] = useState('all')
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<{ ownerId: string | null; rows: NotificationItem[] }>({ ownerId: null, rows: [] })
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [revision, setRevision] = useState(0)
  const [loadedNewest, setLoadedNewest] = useState<string | null>(null)
  const moreRequest = useRef<AbortController | null>(null)
  const params = new URLSearchParams({ status: filter, type, limit: '25', ...(query ? { q: query } : {}) }).toString()

  useEffect(() => {
    const request = new AbortController()
    moreRequest.current?.abort()
    setLoading(true); setLoadingMore(false); setError(null); setExpired(false); setCursor(null)
    if (!ownerId) { setData({ ownerId: null, rows: [] }); setLoading(false); return }
    void (async () => {
      try {
        const response = await fetch(`/api/notifications?${params}`, { signal: request.signal })
        if (request.signal.aborted) return
        if (response.status === 401 || response.status === 403) { setExpired(true); setData({ ownerId, rows: [] }); void refreshSummary(); return }
        if (!response.ok) throw new Error('Your notifications could not be loaded. Please try again.')
        const result: NotificationList = await response.json()
        if (request.signal.aborted) return
        if (result.ownerId !== ownerId) { setExpired(true); setData({ ownerId, rows: [] }); void refreshSummary(); return }
        if (!Array.isArray(result.notifications)) throw new Error('Your notifications could not be loaded. Please try again.')
        setData({ ownerId, rows: result.notifications }); setCursor(result.nextCursor); setLoadedNewest(result.notifications[0]?.id || null)
      } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Your notifications could not be loaded. Please try again.') }
      finally { if (!request.signal.aborted) setLoading(false) }
    })()
    return () => { request.abort(); moreRequest.current?.abort() }
  }, [ownerId, params, changeVersion, revision, refreshSummary])

  async function loadMore() {
    if (!cursor || loadingMore || !ownerId) return
    const request = new AbortController()
    moreRequest.current = request
    setLoadingMore(true); setError(null)
    try {
      const response = await fetch(`/api/notifications?${params}&cursor=${encodeURIComponent(cursor)}`, { signal: request.signal })
      if (request.signal.aborted) return
      if (response.status === 401 || response.status === 403) { setExpired(true); setData({ ownerId, rows: [] }); void refreshSummary(); return }
      if (!response.ok) throw new Error('More notifications could not be loaded. Please try again.')
      const result: NotificationList = await response.json()
      if (request.signal.aborted) return
      if (result.ownerId !== ownerId) { setExpired(true); setData({ ownerId, rows: [] }); void refreshSummary(); return }
      if (!Array.isArray(result.notifications)) throw new Error('More notifications could not be loaded. Please try again.')
      setData(previous => ({ ownerId, rows: [...new Map([...previous.rows, ...result.notifications].map(item => [item.id, item])).values()] }))
      setCursor(result.nextCursor)
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'More notifications could not be loaded. Please try again.') }
    finally { if (!request.signal.aborted) setLoadingMore(false) }
  }

  const rows = data.ownerId === ownerId ? data.rows : []
  const unauthorized = !ownerId || expired || summaryStatus === 'unauthorized'
  const latestActivity = !loading && !unauthorized && filter === 'all' && type === 'all' && !query && notifications[0]?.id && notifications[0].id !== loadedNewest
  const showLatest = () => { setFilter('all'); setType('all'); setQuery(''); setSearch(''); setRevision(value => value + 1); void refreshSummary() }
  return <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
    <nav className="flex gap-4 text-sm"><Link href="/dashboard" className="underline focus-ring">Dashboard</Link><Link href="/community/mine" className="underline focus-ring">My discussions</Link></nav>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold">Notifications</h1><p className="mt-2 text-muted-foreground" role="status">{unreadCount} unread notifications</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={showLatest} disabled={loading || unauthorized}>Refresh</Button><Button onClick={() => void markAllRead()} disabled={unauthorized || !unreadCount || pendingIds.size > 0 || markingAll}>{markingAll ? 'Saving…' : 'Mark all as read'}</Button></div>
    </header>
    <p className="text-sm text-muted-foreground">Mark all as read applies to your whole account, including notifications outside these filters.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Read status<select className="ml-2 rounded border bg-background p-2" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
      <label className="text-sm">Activity type<select className="ml-2 rounded border bg-background p-2" value={type} onChange={event => setType(event.target.value)}><option value="all">All activity</option><option value="community_comment">Comments</option><option value="community_like">Likes</option><option value="other">Other</option></select></label>
      <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); setQuery(search.trim()) }}><Input aria-label="Search notifications" placeholder="Search notifications" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /><Button type="submit" variant="outline">Search</Button></form>
    </div>
    {latestActivity && <div className="flex items-center justify-between gap-3 rounded border bg-muted p-4"><p>New activity is available.</p><Button variant="outline" onClick={showLatest}>Show latest</Button></div>}
    {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
    {error && <div role="alert" className="space-y-2 rounded border p-4"><p>{error}</p><Button variant="outline" onClick={() => cursor && rows.length ? void loadMore() : setRevision(value => value + 1)}>Try again</Button></div>}
    {loading || sessionLoading ? <p role="status">Loading notifications…</p> : unauthorized ? <p><Link href="/auth/signin?callbackUrl=%2Fdashboard%2Fnotifications" className="underline">Sign in to view your notifications</Link></p> : rows.length ? <div className="space-y-3">{rows.map(item => <article key={item.id} aria-label={item.title} className={`rounded-lg border p-4 ${item.read ? '' : 'bg-primary/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{item.title}</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.message}</p><p className="mt-2 text-xs text-muted-foreground"><time dateTime={item.createdAt}>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</time> · {item.read ? 'Read' : 'Unread'}</p></div><Button size="sm" variant="outline" disabled={markingAll || pendingIds.has(item.id)} onClick={() => void markRead(item.id, !item.read)}>{pendingIds.has(item.id) ? 'Saving…' : item.read ? 'Mark as unread' : 'Mark as read'}</Button></div>
    </article>)}</div> : !error ? <p className="rounded border p-6">No notifications match these filters.</p> : null}
    {!unauthorized && cursor && rows.length > 0 && <Button variant="outline" disabled={loadingMore || loading} onClick={() => void loadMore()}>{loadingMore ? 'Loading more…' : 'Load more'}</Button>}
  </main>
}
