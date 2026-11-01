'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import PostCard, { type CommunityPost } from '@/components/community/PostCard'

interface PostPage {
  data: CommunityPost[]
  nextCursor: string | null
}

interface Props {
  topicId?: string
  topicSlug?: string
  tagId?: string
  mine?: boolean
}

/** One paginated, searchable feed for community, topic, tag, and owned discussions. */
export default function PostFeed({ topicId, topicSlug, tagId, mine = false }: Props) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [retry, setRetry] = useState(0)
  const moreRequest = useRef<AbortController | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<'latest' | 'most_liked' | 'most_commented'>('latest')
  const searchId = useId()
  const query = new URLSearchParams()
  if (topicId) query.set('topicId', topicId)
  if (tagId) query.set('tagId', tagId)
  if (mine) query.set('mine', '1')
  if (sort !== 'latest') query.set('sort', sort)
  if (searchQuery) query.set('search', searchQuery)
  const filterQuery = query.toString()
  const createHref = topicSlug ? `/community/create?topic=${encodeURIComponent(topicSlug)}` : '/community/create'

  useEffect(() => {
    const controller = new AbortController()
    moreRequest.current?.abort()
    moreRequest.current = null
    setPosts([])
    setNextCursor(null)
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setSignedOut(false)

    async function load() {
      try {
        const response = await fetch(`/api/community/posts?${filterQuery}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          setSignedOut(true)
          return
        }
        if (!response.ok) throw new Error('Could not load discussions')
        const page: PostPage = await response.json()
        if (controller.signal.aborted) return
        setPosts(page.data)
        setNextCursor(page.nextCursor)
      } catch {
        if (!controller.signal.aborted) setError('We couldn’t load the discussions. Please try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => {
      controller.abort()
      moreRequest.current?.abort()
      moreRequest.current = null
    }
  }, [filterQuery, retry])

  async function loadMore() {
    if (!nextCursor || loading || moreRequest.current) return
    const controller = new AbortController()
    moreRequest.current = controller
    setLoadingMore(true)
    setError(null)
    try {
      const query = new URLSearchParams(filterQuery)
      query.set('cursor', nextCursor)
      const response = await fetch(`/api/community/posts?${query}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (response.status === 401) {
        setSignedOut(true)
        return
      }
      if (!response.ok) throw new Error('Could not load more discussions')
      const page: PostPage = await response.json()
      if (controller.signal.aborted) return
      setPosts(previous => [...new Map([...previous, ...page.data].map(post => [post.id, post])).values()])
      setNextCursor(page.nextCursor)
    } catch {
      if (!controller.signal.aborted) setError('We couldn’t load more discussions. Your place has been saved; please try again.')
    } finally {
      if (!controller.signal.aborted) {
        moreRequest.current = null
        setLoadingMore(false)
      }
    }
  }

  return (
    <section aria-label={mine ? 'My discussions' : topicId ? 'Topic discussions' : tagId ? 'Tagged discussions' : 'Community discussions'} className="space-y-4">
      <form onSubmit={event => { event.preventDefault(); setSearchQuery(searchInput.trim()) }} className="flex flex-wrap gap-2">
        <label htmlFor={searchId} className="sr-only">Search discussions</label>
        <Input id={searchId} value={searchInput} onChange={event => setSearchInput(event.target.value)} maxLength={200} placeholder="Search discussions…" className="min-w-40 flex-1" />
        <Button type="submit" variant="outline">Search</Button>
        {searchQuery && <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearchQuery('') }}>Clear search</Button>}
      </form>
      <div className="flex flex-wrap items-center gap-2" aria-label="Discussion order">
        <span className="text-sm text-muted-foreground">Sort:</span>
        {([
          { value: 'latest', label: 'Latest' },
          { value: 'most_liked', label: 'Most Liked' },
          { value: 'most_commented', label: 'Most Commented' },
        ] as const).map(option => <Button key={option.value} type="button" size="sm" variant={sort === option.value ? 'default' : 'ghost'} aria-pressed={sort === option.value} onClick={() => setSort(option.value)}>{option.label}</Button>)}
      </div>
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading discussions…</div> : signedOut ? (
      <Card><CardContent className="py-8 text-center space-y-4">
        <p>Sign in to read community discussions.</p>
        <Button asChild><Link href="/auth/signin">Sign in</Link></Button>
      </CardContent></Card>
      ) : <>
      {error && (
        <div role="alert" className="rounded-lg border p-4 space-y-3">
          <p className="text-sm">{error}</p>
          {!posts.length && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
        </div>
      )}
      {!posts.length && !error ? (
        <Card><CardContent className="py-12 text-center space-y-4">
          <h2 className="text-lg font-medium">{searchQuery ? 'No matching discussions' : mine ? 'Start your first discussion' : 'Start the first discussion'}</h2>
          <p className="text-sm text-muted-foreground">{searchQuery ? 'Try another search or clear it to see all discussions in this view.' : mine ? 'The conversations you start will appear here.' : 'Share a question, an experience, or something you’re learning.'}</p>
          <Button asChild><Link href={createHref}>Create Post</Link></Button>
        </CardContent></Card>
      ) : posts.map(post => <PostCard key={post.id} post={post} />)}
      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load More'}</Button>
        </div>
      )}
      </>}
    </section>
  )
}
