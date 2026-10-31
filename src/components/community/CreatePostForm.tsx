"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface Topic {
  id: string
  slug: string
  name: string
  description: string | null
}

interface Tag {
  id: string
  slug: string
  name: string
}

const WRITING_PROMPTS = [
  "Share your healing journey — what has transformed for you?",
  "What insight helped you recently?",
  "What challenge are you working through right now?",
  "Describe a meditation or healing experience that moved you.",
  "What practice has made the biggest difference in your life?",
]

async function readOptions<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('Unable to load options')
  const body: { data?: T[] } = await response.json()
  if (!Array.isArray(body.data)) throw new Error('Invalid options response')
  return body.data
}

/** The existing post composer, with an optional active topic selected from its URL. */
export default function CreatePostForm({ initialTopicSlug = '' }: { initialTopicSlug?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [selectedTopicId, setSelectedTopicId] = useState("")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [topicsError, setTopicsError] = useState(false)
  const [tagsError, setTagsError] = useState(false)
  const [optionsVersion, setOptionsVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setTopicsLoading(true)
    setTopicsError(false)
    setTagsError(false)

    void readOptions<Topic>('/api/community/topics', controller.signal)
      .then(options => {
        if (controller.signal.aborted) return
        setTopics(options)
        setSelectedTopicId(options.find(topic => topic.slug === initialTopicSlug)?.id || '')
      })
      .catch(() => { if (!controller.signal.aborted) setTopicsError(true) })
      .finally(() => { if (!controller.signal.aborted) setTopicsLoading(false) })

    void readOptions<Tag>('/api/community/tags', controller.signal)
      .then(options => { if (!controller.signal.aborted) setTags(options) })
      .catch(() => { if (!controller.signal.aborted) setTagsError(true) })

    return () => controller.abort()
  }, [initialTopicSlug, optionsVersion])

  const selectedTopic = topics.find(topic => topic.id === selectedTopicId)
  const requestedTopic = topics.find(topic => topic.slug === initialTopicSlug)
  const unavailableTopic = initialTopicSlug && !topicsLoading && !topicsError && !requestedTopic && !selectedTopic

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : prev.length < 5
          ? [...prev, tagId]
          : prev,
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || topicsLoading || topicsError) return

    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          topicId: selectedTopicId || undefined,
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.code === 'TOPIC_UNAVAILABLE') setOptionsVersion(value => value + 1)
        throw new Error(err.error || "Failed to create post")
      }

      const { data } = await res.json()
      toast.success("Post created!")
      router.push(`/community/post/${data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create post")
    } finally {
      setSaving(false)
    }
  }

  // Keep the first server/client render identical, then vary the writing prompt.
  const [prompt, setPrompt] = useState(WRITING_PROMPTS[0])
  useEffect(() => {
    setPrompt(WRITING_PROMPTS[Math.floor(Math.random() * WRITING_PROMPTS.length)])
  }, [])

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={requestedTopic ? `/community/topic/${encodeURIComponent(requestedTopic.slug)}` : '/community'}>
          ← {requestedTopic ? `${requestedTopic.name} discussions` : 'Community'}
        </Link>
      </Button>
      {/* Writing Prompt */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <p className="text-sm text-primary italic">&ldquo;{prompt}&rdquo;</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">Create Post</h1>
          <CardDescription>{selectedTopic ? `Start a discussion in ${selectedTopic.name}` : 'Share your thoughts with the community'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Topic Selection */}
            <div className="space-y-2">
              {topicsLoading && <p role="status" className="text-sm text-muted-foreground">Loading topics…</p>}
              {topicsError && (
                <div role="alert" className="rounded-md border p-3 space-y-2">
                  <p className="text-sm">We couldn’t load the topics. Your draft is still here.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setOptionsVersion(value => value + 1)}>Try again</Button>
                </div>
              )}
              {unavailableTopic && <p role="status" className="text-sm text-muted-foreground">That topic is no longer available. Choose another topic below, or publish without one.</p>}
              {!topicsLoading && !topicsError && (
                <div className="space-y-2">
                  <label htmlFor="post-topic" className="text-sm font-medium">Topic</label>
                  <select
                    id="post-topic"
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    disabled={saving}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">No topic (optional)</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post…"
                maxLength={5000}
                className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Tags Selection */}
            {tagsError && !topicsLoading && !topicsError && <p className="text-sm text-muted-foreground">Tags are unavailable right now. You can still publish your post.</p>}
            {tags.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Tags <span className="text-muted-foreground font-normal">(up to 5)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={saving || topicsLoading || topicsError}>
                {saving ? "Publishing…" : "Publish"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
