"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { communityDraftKey, parseCommunityDraft } from '@/lib/community/drafts'

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
export default function CreatePostForm({ initialTopicSlug = '', draftOwnerId }: { initialTopicSlug?: string; draftOwnerId: string }) {
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
  const [preview, setPreview] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<'restored' | 'saved' | 'unavailable' | null>(null)
  const dirty = useRef(false)
  const stopSaving = useRef(false)
  const preserveTopic = useRef(false)
  const draftKey = communityDraftKey(draftOwnerId, initialTopicSlug)

  useEffect(() => {
    dirty.current = false
    stopSaving.current = false
    preserveTopic.current = false
    let draft = null
    try {
      draft = parseCommunityDraft(window.localStorage.getItem(draftKey))
      setDraftStatus(draft ? 'restored' : null)
    } catch {
      setDraftStatus('unavailable')
    }
    setTitle(draft?.title || '')
    setContent(draft?.content || '')
    setSelectedTopicId(draft?.topicId || '')
    setSelectedTagIds(draft?.tagIds || [])
    preserveTopic.current = !!draft && draft.topicChosen
    setLoadedDraftKey(draftKey)
  }, [draftKey])

  useEffect(() => {
    if (loadedDraftKey !== draftKey || !dirty.current || stopSaving.current || saving) return
    try {
      if (!title.trim() && !content.trim()) {
        window.localStorage.removeItem(draftKey)
        setDraftStatus(null)
      } else {
        window.localStorage.setItem(draftKey, JSON.stringify({ version: 1, title, content, topicId: selectedTopicId, tagIds: selectedTagIds, topicChosen: preserveTopic.current || !topicsLoading }))
        setDraftStatus('saved')
      }
    } catch {
      setDraftStatus('unavailable')
    }
  }, [draftKey, loadedDraftKey, title, content, selectedTopicId, selectedTagIds, saving, topicsLoading])

  function markEdited() {
    dirty.current = true
    stopSaving.current = false
  }

  function discardDraft() {
    stopSaving.current = true
    dirty.current = false
    let removed = true
    try { window.localStorage.removeItem(draftKey) } catch { removed = false; toast.error('The editor was cleared, but this browser could not remove the saved draft.') }
    setTitle('')
    setContent('')
    setSelectedTopicId(topics.find(topic => topic.slug === initialTopicSlug)?.id || '')
    setSelectedTagIds([])
    setDraftStatus(removed ? null : 'unavailable')
    setPreview(false)
    setDiscardOpen(false)
    preserveTopic.current = false
  }

  useEffect(() => {
    const controller = new AbortController()
    setTopicsLoading(true)
    setTopicsError(false)
    setTagsError(false)

    void readOptions<Topic>('/api/community/topics', controller.signal)
      .then(options => {
        if (controller.signal.aborted) return
        setTopics(options)
        setSelectedTopicId(current => preserveTopic.current
          ? (options.some(topic => topic.id === current) ? current : '')
          : options.find(topic => topic.slug === initialTopicSlug)?.id || '')
      })
      .catch(() => { if (!controller.signal.aborted) setTopicsError(true) })
      .finally(() => { if (!controller.signal.aborted) setTopicsLoading(false) })

    void readOptions<Tag>('/api/community/tags', controller.signal)
      .then(options => {
        if (controller.signal.aborted) return
        setTags(options)
        setSelectedTagIds(current => current.filter(id => options.some(tag => tag.id === id)))
      })
      .catch(() => {
        if (!controller.signal.aborted) { setTagsError(true); setSelectedTagIds([]) }
      })

    return () => controller.abort()
  }, [initialTopicSlug, draftOwnerId, optionsVersion])

  const selectedTopic = topics.find(topic => topic.id === selectedTopicId)
  const requestedTopic = topics.find(topic => topic.slug === initialTopicSlug)
  const unavailableTopic = initialTopicSlug && !topicsLoading && !topicsError && !requestedTopic && !selectedTopic

  const toggleTag = (tagId: string) => {
    markEdited()
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
        if (err.code === 'TOPIC_UNAVAILABLE' || err.code === 'TAG_UNAVAILABLE') setOptionsVersion(value => value + 1)
        throw new Error(err.error || "Failed to create post")
      }

      const { data } = await res.json()
      stopSaving.current = true
      try { window.localStorage.removeItem(draftKey) } catch { /* A successful publication must not be reported as failed because storage is blocked. */ }
      setDraftStatus(null)
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2" aria-label="Composer view">
                <Button type="button" variant={preview ? 'ghost' : 'secondary'} aria-pressed={!preview} onClick={() => setPreview(false)}>Write</Button>
                <Button type="button" variant={preview ? 'secondary' : 'ghost'} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</Button>
              </div>
              {(title || content || draftStatus === 'restored') && <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDiscardOpen(true)}>Discard draft</Button>}
            </div>
            {draftStatus && <p role="status" className="text-xs text-muted-foreground">{draftStatus === 'restored' ? 'Your saved draft was restored from this device.' : draftStatus === 'saved' ? 'Draft saved on this device.' : 'Draft saving is unavailable on this device. You can still write and publish.'}</p>}
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
                    onChange={(e) => { markEdited(); preserveTopic.current = true; setSelectedTopicId(e.target.value) }}
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

            {preview ? (
              <article aria-label="Post preview" className="rounded-lg border bg-muted/20 p-5 space-y-4">
                <p className="text-xs text-muted-foreground">Preview · Only you can see this draft</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTopic && <Badge variant="outline">{selectedTopic.name}</Badge>}
                  {tags.filter(tag => selectedTagIds.includes(tag.id)).map(tag => <Badge key={tag.id} variant="secondary">#{tag.name}</Badge>)}
                </div>
                <h2 className="text-xl font-semibold break-words">{title.trim() || 'Untitled discussion'}</h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content || 'Your discussion will appear here as you write.'}</p>
              </article>
            ) : <>
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => { markEdited(); setTitle(e.target.value) }}
                placeholder="Post title"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => { markEdited(); setContent(e.target.value) }}
                placeholder="Write your post…"
                maxLength={5000}
                className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground text-right">{content.length}/5000</p>
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
                    <button
                      type="button"
                      key={tag.id}
                      aria-pressed={selectedTagIds.includes(tag.id)}
                      disabled={saving || (!selectedTagIds.includes(tag.id) && selectedTagIds.length >= 5)}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      onClick={() => toggleTag(tag.id)}
                    >
                      <Badge variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}>{tag.name}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
            </>}

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
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Discard this draft?</DialogTitle><DialogDescription>This removes the saved draft from this device and clears the composer.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>Keep writing</Button>
            <Button type="button" variant="destructive" onClick={discardDraft}>Discard draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
