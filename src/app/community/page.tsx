"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import PostCard, { type CommunityPost } from "@/components/community/PostCard"

interface Topic {
  id: string
  slug: string
  name: string
  description: string | null
}

type SortMode = "latest" | "most_liked" | "most_commented"

export default function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>("latest")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInput, setSearchInput] = useState("")

  // Fetch topics on mount
  useEffect(() => {
    fetch("/api/community/topics")
      .then((r) => r.json())
      .then((json) => { if (json.data) setTopics(json.data) })
      .catch(() => {})
  }, [])

  const fetchPosts = useCallback(
    async (cursor?: string) => {
      const isMore = !!cursor
      if (isMore) setLoadingMore(true)
      else setLoading(true)

      try {
        const params = new URLSearchParams()
        if (cursor) params.set("cursor", cursor)
        if (selectedTopic) params.set("topicId", selectedTopic)
        if (sort !== "latest") params.set("sort", sort)
        if (searchQuery) params.set("search", searchQuery)
        const res = await fetch(`/api/community/posts?${params}`)
        if (!res.ok) throw new Error()
        const json = await res.json()
        setPosts((prev) => (isMore ? [...prev, ...json.data] : json.data))
        setNextCursor(json.nextCursor)
      } catch {
        toast.error("Failed to load posts")
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [selectedTopic, sort, searchQuery],
  )

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Community</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/community/topics">Explore Topics</Link></Button>
          <Button asChild><Link href="/community/create">Create Post</Link></Button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search posts…"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">Search</Button>
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setSearchInput(""); setSearchQuery("") }}
          >
            Clear
          </Button>
        )}
      </form>

      {/* Topic Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedTopic === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedTopic(null)}
        >
          All
        </Button>
        {topics.map((topic) => (
          <Button
            key={topic.id}
            variant={selectedTopic === topic.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTopic(topic.id === selectedTopic ? null : topic.id)}
          >
            {topic.name}
          </Button>
        ))}
      </div>

      {/* Sort Options */}
      <div className="flex gap-2 text-sm">
        <span className="text-muted-foreground self-center">Sort:</span>
        {(
          [
            { value: "latest", label: "Latest" },
            { value: "most_liked", label: "Most Liked" },
            { value: "most_commented", label: "Most Commented" },
          ] as const
        ).map((option) => (
          <Button
            key={option.value}
            variant={sort === option.value ? "default" : "ghost"}
            size="sm"
            onClick={() => setSort(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery
              ? "No posts match your search."
              : "No posts yet. Be the first to start a discussion!"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map(post => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {nextCursor && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => fetchPosts(nextCursor)}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load More"}
          </Button>
        </div>
      )}
    </div>
  )
}
