'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import PostCard, { type CommunityPost } from '@/components/community/PostCard'

interface PostPage {
  data: CommunityPost[]
  nextCursor: string | null
}

/** Browse the existing authenticated post API within a single topic. */
export default function TopicPosts({ topicId, topicSlug }: { topicId: string; topicSlug: string }) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [retry, setRetry] = useState(0)
  const moreRequest = useRef<AbortController | null>(null)

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
        const query = new URLSearchParams({ topicId })
        const response = await fetch(`/api/community/posts?${query}`, { signal: controller.signal })
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
  }, [topicId, retry])

  async function loadMore() {
    if (!nextCursor || loading || moreRequest.current) return
    const controller = new AbortController()
    moreRequest.current = controller
    setLoadingMore(true)
    setError(null)
    try {
      const query = new URLSearchParams({ topicId, cursor: nextCursor })
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

  if (loading) {
    return <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading discussions…</div>
  }

  if (signedOut) {
    return (
      <Card><CardContent className="py-8 text-center space-y-4">
        <p>Sign in to read community discussions.</p>
        <Button asChild><Link href="/auth/signin">Sign in</Link></Button>
      </CardContent></Card>
    )
  }

  return (
    <section aria-label="Topic discussions" className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border p-4 space-y-3">
          <p className="text-sm">{error}</p>
          {!posts.length && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
        </div>
      )}
      {!posts.length && !error ? (
        <Card><CardContent className="py-12 text-center space-y-4">
          <h2 className="text-lg font-medium">Start the first discussion</h2>
          <p className="text-sm text-muted-foreground">There are no posts in this topic yet. Share a question, an experience, or something you’re learning.</p>
          <Button asChild><Link href={`/community/create?topic=${encodeURIComponent(topicSlug)}`}>Create Post</Link></Button>
        </CardContent></Card>
      ) : posts.map(post => <PostCard key={post.id} post={post} />)}
      {nextCursor && (
        <div className="text-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load More'}</Button>
        </div>
      )}
    </section>
  )
}
