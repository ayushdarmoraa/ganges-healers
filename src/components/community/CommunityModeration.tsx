'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CommunityTargetType, ModerationAction } from '@/lib/community/moderation'

interface Target {
  id: string
  kind: CommunityTargetType
  title: string | null
  content: string
  userId: string
  user: { name: string | null }
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  isPinned: boolean
  postId: string
  postTitle: string
  parentHidden: boolean
  removalType: 'author' | 'moderation' | 'unknown' | null
  canRestore: boolean
}
interface Report {
  id: string
  targetType: CommunityTargetType
  targetId: string
  reason: string
  status: 'pending' | 'reviewed' | 'dismissed'
  createdAt: string
  reviewedAt: string | null
  user: { name: string | null }
  reviewer: { name: string | null } | null
  target: Target | null
}
interface Metrics {
  totalPosts: number; postsToday: number; postsThisWeek: number; totalComments: number
  commentsThisWeek: number; avgCommentsPerPost: number; totalUsers: number
  activeContributorsThisWeek: number; vipParticipants: number
  hiddenPosts?: number; hiddenComments?: number; pendingReports?: number
}
interface Decision {
  action: ModerationAction
  reportId?: string
  targetType: CommunityTargetType
  targetId: string
  target: Target | null
}
const actionText: Record<ModerationAction, { label: string; explanation: string }> = {
  reviewed: { label: 'Hide content and resolve reports', explanation: 'This hides the content from members and resolves every pending report for it.' },
  hide: { label: 'Hide content', explanation: 'This hides the content from members and resolves every pending report for it. No content is permanently deleted.' },
  dismissed: { label: 'Dismiss report', explanation: 'This closes this report without changing the content or other pending reports.' },
  resolve: { label: 'Mark report reviewed', explanation: 'This closes this report while keeping the content’s current visibility.' },
  restore: { label: 'Restore content', explanation: 'This makes the content visible again. Closed reports stay in the review history.' },
  pin: { label: 'Pin discussion', explanation: 'This places the discussion above regular posts in the latest feed.' },
  unpin: { label: 'Unpin discussion', explanation: 'This returns the discussion to the regular feed order.' },
}

function visibility(target: Target) {
  if (target.removalType === 'author') return 'Removed by author'
  if (target.removalType === 'moderation') return 'Hidden by moderation'
  if (target.deletedAt) return 'Hidden · history unavailable'
  if (target.parentHidden) return 'Parent discussion hidden'
  return 'Visible'
}

function ContentPreview({ target, full = false }: { target: Target; full?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
      <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">{target.kind === 'post' ? 'Discussion' : 'Comment'}</Badge><Badge variant={target.deletedAt || target.parentHidden ? 'secondary' : 'outline'}>{visibility(target)}</Badge>{target.isPinned && <Badge>Pinned</Badge>}</div>
      <p className="text-xs text-muted-foreground">By {target.user.name || 'Member'} · {new Date(target.createdAt).toLocaleString()}</p>
      <h3 className="font-semibold break-words">{target.title || `Comment on ${target.postTitle}`}</h3>
      {full ? <p className="text-sm whitespace-pre-wrap break-words">{target.content}</p> : <details><summary className="cursor-pointer text-sm text-primary">Read full content</summary><p className="mt-2 text-sm whitespace-pre-wrap break-words">{target.content}</p></details>}
      {!target.deletedAt && !target.parentHidden && <Link href={`/community/post/${target.postId}${target.kind === 'comment' ? `#comment-${target.id}` : ''}`} className="inline-block text-sm text-primary underline">Open discussion</Link>}
      {target.deletedAt && !target.canRestore && <p className="text-xs text-muted-foreground">{target.parentHidden ? 'The parent discussion must be restored first.' : 'Author removals and unknown removal history cannot be restored here.'}</p>}
    </div>
  )
}

export default function CommunityModeration() {
  const [view, setView] = useState<'reports' | 'content' | 'metrics'>('reports')
  const [status, setStatus] = useState('pending')
  const [kind, setKind] = useState<'all' | CommunityTargetType>('all')
  const [contentVisibility, setContentVisibility] = useState('visible')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reports, setReports] = useState<Report[]>([])
  const [content, setContent] = useState<Target[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [counts, setCounts] = useState({ pending: 0, reviewed: 0, dismissed: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [revision, setRevision] = useState(0)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)
  const moreRequest = useRef<AbortController | null>(null)
  const query = new URLSearchParams({ view, limit: '25' })
  if (view === 'reports') { query.set('status', status); query.set('type', kind) }
  if (view === 'content') { query.set('type', kind === 'all' ? 'post' : kind); query.set('visibility', contentVisibility) }
  if (view !== 'metrics' && search) query.set('q', search)
  const filterQuery = query.toString()

  useEffect(() => {
    const controller = new AbortController()
    moreRequest.current?.abort()
    moreRequest.current = null
    setLoading(true); setLoadingMore(false); setError(null); setForbidden(false)
    setReports([]); setContent([]); setNextCursor(null)
    async function load() {
      try {
        const response = await fetch(`/api/admin/community?${filterQuery}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401 || response.status === 403) { setForbidden(true); return }
        if (!response.ok) throw new Error('Could not load moderation data')
        const body = await response.json()
        if (controller.signal.aborted) return
        if (view === 'metrics') setMetrics(body.data)
        else {
          if (!Array.isArray(body.data)) throw new Error('Invalid moderation response')
          if (view === 'reports') setReports(body.data)
          else setContent(body.data)
          setNextCursor(body.nextCursor || null)
        }
        if (typeof body.pendingCount === 'number') setPendingCount(body.pendingCount)
        if (body.counts) setCounts(body.counts)
      } catch {
        if (!controller.signal.aborted) setError('We couldn’t load moderation data. Please try again.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => { controller.abort(); moreRequest.current?.abort(); moreRequest.current = null }
  }, [filterQuery, revision, view])

  async function loadMore() {
    if (!nextCursor || moreRequest.current || loading || view === 'metrics') return
    const controller = new AbortController()
    moreRequest.current = controller; setLoadingMore(true); setError(null)
    try {
      const params = new URLSearchParams(filterQuery); params.set('cursor', nextCursor)
      const response = await fetch(`/api/admin/community?${params}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401 || response.status === 403) { setForbidden(true); return }
      if (!response.ok) throw new Error('Could not load more')
      const body = await response.json()
      if (controller.signal.aborted) return
      if (!Array.isArray(body.data)) throw new Error('Invalid moderation response')
      if (view === 'reports') setReports(previous => [...new Map([...previous, ...body.data].map(item => [item.id, item])).values()])
      else setContent(previous => [...new Map([...previous, ...body.data].map(item => [item.id, item])).values()])
      setNextCursor(body.nextCursor || null)
    } catch { if (!controller.signal.aborted) setError('More items could not be loaded. The current results are preserved; try Load More again.') }
    finally { if (!controller.signal.aborted) { setLoadingMore(false); moreRequest.current = null } }
  }

  function requestDecision(action: ModerationAction, target: Target | null, report?: Report) {
    if (!target && !report) return
    setDecisionError(null)
    setDecision({ action, target, reportId: report?.id, targetType: report?.targetType || target!.kind, targetId: report?.targetId || target!.id })
  }

  async function confirmDecision() {
    if (!decision || actioning) return
    setActioning(true); setDecisionError(null)
    try {
      const response = await fetch('/api/admin/community', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: decision.action, reportId: decision.reportId, targetType: decision.targetType, targetId: decision.targetId, expectedUpdatedAt: decision.target?.updatedAt }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'The decision could not be saved')
      toast.success(body.idempotent ? 'This decision was already applied.' : `${actionText[decision.action].label} — saved`)
      setDecision(null); setRevision(value => value + 1)
    } catch (error) { setDecisionError(error instanceof Error ? error.message : 'The decision could not be saved') }
    finally { setActioning(false) }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <nav className="flex flex-wrap gap-3 text-sm"><Link href="/admin" className="text-primary underline">← Admin</Link><Link href="/community" className="text-primary underline">Community</Link></nav>
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="text-3xl font-semibold">Community Moderation</h1><p className="text-muted-foreground">Review reports, manage visibility, and keep a clear decision history.</p></div><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh</Button></header>
      <div className="flex flex-wrap gap-2" aria-label="Moderation views">{(['reports', 'content', 'metrics'] as const).map(item => <Button key={item} variant={view === item ? 'default' : 'outline'} aria-pressed={view === item} onClick={() => { setView(item); setSearch(''); setSearchInput('') }}>{item === 'reports' ? `Reports (${pendingCount} pending)` : item === 'content' ? 'Content' : 'Metrics'}</Button>)}</div>
      {view !== 'metrics' && <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {view === 'reports' ? <label className="text-sm space-y-1"><span className="block">Report status</span><select value={status} onChange={event => setStatus(event.target.value)} className="rounded-md border bg-background px-3 py-2">{(['pending', 'reviewed', 'dismissed'] as const).map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)} ({counts[item]})</option>)}<option value="all">All statuses</option></select></label> : <label className="text-sm space-y-1"><span className="block">Visibility</span><select value={contentVisibility} onChange={event => setContentVisibility(event.target.value)} className="rounded-md border bg-background px-3 py-2"><option value="visible">Visible</option><option value="hidden">Hidden</option><option value="all">All content</option></select></label>}
          <label className="text-sm space-y-1"><span className="block">Content type</span><select value={view === 'content' && kind === 'all' ? 'post' : kind} onChange={event => setKind(event.target.value as 'all' | CommunityTargetType)} className="rounded-md border bg-background px-3 py-2">{view === 'reports' && <option value="all">All types</option>}<option value="post">Discussions</option><option value="comment">Comments</option></select></label>
        </div>
        <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()) }} className="flex flex-wrap gap-2"><label htmlFor="moderation-search" className="sr-only">{view === 'reports' ? 'Search reason or reporter' : 'Search content'}</label><Input id="moderation-search" value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={200} placeholder={view === 'reports' ? 'Search reason, reporter, or target ID…' : 'Search content…'} className="flex-1 min-w-40" /><Button variant="outline" type="submit">Search</Button>{search && <Button variant="ghost" type="button" onClick={() => { setSearch(''); setSearchInput('') }}>Clear search</Button>}</form>
      </div>}
      {error && <div role="alert" className="rounded-lg border p-4 space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
      {loading ? <p role="status" className="py-12 text-center text-muted-foreground">Loading moderation data…</p> : forbidden ? <p role="alert" className="rounded-lg border p-6">Your account does not have access to community moderation.</p> : view === 'reports' ? <div className="space-y-4">
        {!reports.length && !error && <p className="rounded-lg border p-8 text-center text-muted-foreground">No reports match these filters.</p>}
        {reports.map(report => <Card key={report.id}><CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Badge variant="outline">{report.targetType === 'post' ? 'Discussion' : 'Comment'}</Badge><Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'}>{report.status}</Badge></div><time className="text-xs text-muted-foreground" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></div>
          <div className="space-y-1 text-sm"><p className="text-muted-foreground">Reported by {report.user.name || 'Member'}</p><p className="whitespace-pre-wrap break-words"><span className="font-semibold">Reason: </span>{report.reason}</p></div>
          {report.target ? <ContentPreview target={report.target} /> : <p className="text-sm text-muted-foreground">This content is no longer available. The report can still be closed.</p>}
          {report.status === 'pending' ? <div className="flex flex-wrap gap-2">{report.target && !report.target.deletedAt && <Button variant="destructive" size="sm" onClick={() => requestDecision('hide', report.target, report)}>Hide & resolve</Button>}<Button variant="outline" size="sm" onClick={() => requestDecision('dismissed', report.target, report)}>Dismiss report</Button><Button variant="ghost" size="sm" onClick={() => requestDecision('resolve', report.target, report)}>Mark reviewed</Button></div> : <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><p>{report.reviewer?.name || 'Moderator'} · {report.reviewedAt ? new Date(report.reviewedAt).toLocaleString() : 'Reviewed'}</p>{report.target?.canRestore && <Button size="sm" variant="outline" onClick={() => requestDecision('restore', report.target, report)}>Restore content</Button>}</div>}
        </CardContent></Card>)}
      </div> : view === 'content' ? <div className="space-y-4">
        {!content.length && !error && <p className="rounded-lg border p-8 text-center text-muted-foreground">No content matches these filters.</p>}
        {content.map(target => <Card key={target.id}><CardContent className="p-5 space-y-3"><ContentPreview target={target} /><div className="flex flex-wrap gap-2">{!target.deletedAt ? <Button size="sm" variant="destructive" onClick={() => requestDecision('hide', target)}>Hide content</Button> : target.canRestore && <Button size="sm" variant="outline" onClick={() => requestDecision('restore', target)}>Restore content</Button>}{target.kind === 'post' && (!target.deletedAt || target.isPinned) && <Button size="sm" variant="outline" onClick={() => requestDecision(target.isPinned ? 'unpin' : 'pin', target)}>{target.isPinned ? 'Unpin discussion' : 'Pin discussion'}</Button>}</div></CardContent></Card>)}
      </div> : metrics && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{([
        ['Visible discussions', metrics.totalPosts], ['Discussions today', metrics.postsToday], ['Discussions this week', metrics.postsThisWeek],
        ['Visible comments', metrics.totalComments], ['Comments this week', metrics.commentsThisWeek], ['Comments per discussion', metrics.avgCommentsPerPost],
        ['Active contributors · 7 days', metrics.activeContributorsThisWeek], ['VIP participants', metrics.vipParticipants], ['Total accounts', metrics.totalUsers],
        ['Hidden discussions', metrics.hiddenPosts || 0], ['Hidden comments', metrics.hiddenComments || 0], ['Pending reports', metrics.pendingReports || 0],
      ] as const).map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{value}</p></CardContent></Card>)}</div>}
      {nextCursor && !forbidden && <div className="text-center"><Button variant="outline" disabled={loadingMore || loading} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load More'}</Button></div>}
      <Dialog open={!!decision} onOpenChange={open => { if (!open && !actioning) { setDecision(null); setDecisionError(null) } }}><DialogContent showCloseButton={!actioning} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {decision && <><DialogHeader><DialogTitle>{actionText[decision.action].label}?</DialogTitle><DialogDescription>{actionText[decision.action].explanation}</DialogDescription></DialogHeader>{decision.target && <ContentPreview target={decision.target} full />}{decisionError && <div role="alert" className="rounded-lg border p-3 space-y-2"><p className="text-sm">{decisionError}</p><Button variant="outline" size="sm" onClick={() => { setDecision(null); setRevision(value => value + 1) }}>Refresh queue</Button></div>}<DialogFooter><Button variant="outline" disabled={actioning} onClick={() => setDecision(null)}>Cancel</Button><Button variant={['hide', 'reviewed'].includes(decision.action) ? 'destructive' : 'default'} disabled={actioning} onClick={() => void confirmDecision()}>{actioning ? 'Saving…' : 'Confirm decision'}</Button></DialogFooter></>}
      </DialogContent></Dialog>
    </div>
  )
}
