'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import PostFeed from '@/components/community/PostFeed'

interface Topic {
  id: string
  name: string
}

export default function CommunityPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>()

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/community/topics', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (!controller.signal.aborted && Array.isArray(body?.data)) setTopics(body.data) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1"><h1 className="text-3xl font-semibold">Community</h1><p className="text-sm text-muted-foreground">Questions, experiences, and conversations to grow together.</p></div>
          <Button asChild><Link href="/community/create">Create Post</Link></Button>
        </div>
        <nav aria-label="Community browsing" className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/community/topics">Explore Topics</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/community/tags">Explore Tags</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/community/mine">My Discussions</Link></Button>
        </nav>
      </header>
      {topics.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Filter by topic">
        <Button size="sm" variant={!selectedTopic ? 'default' : 'outline'} aria-pressed={!selectedTopic} onClick={() => setSelectedTopic(undefined)}>All</Button>
        {topics.map(topic => <Button key={topic.id} size="sm" variant={selectedTopic === topic.id ? 'default' : 'outline'} aria-pressed={selectedTopic === topic.id} onClick={() => setSelectedTopic(current => current === topic.id ? undefined : topic.id)}>{topic.name}</Button>)}
      </div>}
      <PostFeed topicId={selectedTopic} />
    </div>
  )
}
