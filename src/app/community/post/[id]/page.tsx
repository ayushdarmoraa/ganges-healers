"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { Loader2, Heart, Flag, Pencil, Trash2, Pin } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useSession } from "next-auth/react"

interface Comment {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; image: string | null }
  hasPendingReport?: boolean
}

interface Tag {
  tag: { id: string; slug: string; name: string }
}

interface Post {
  id: string
  title: string
  content: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; image: string | null }
  topic: { id: string; slug: string; name: string } | null
  tags: Tag[]
  comments: Comment[]
  _count: { likes: number }
  liked: boolean
  hasPendingReport?: boolean
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const currentUserId = session?.user?.id

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadState, setLoadState] = useState<'missing' | 'signed-out' | 'error' | null>(null)
  const [reload, setReload] = useState(0)
  const [comment, setComment] = useState("")
  const [commenting, setCommenting] = useState(false)
  const [liking, setLiking] = useState(false)

  // Edit states
  const [editingPost, setEditingPost] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [savingPostEdit, setSavingPostEdit] = useState(false)

  // Comment editing
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentContent, setEditCommentContent] = useState("")
  const [savingCommentEdit, setSavingCommentEdit] = useState(false)

  // Report
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "comment"; id: string } | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [reporting, setReporting] = useState(false)
  const [reportNotice, setReportNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setPost(null); setLoadState(null); setReportTarget(null); setReportNotice(null)
    async function load() {
      try {
        const res = await fetch(`/api/community/posts/${params.id}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (res.status === 404) { setLoadState('missing'); return }
        if (res.status === 401) { setLoadState('signed-out'); return }
        if (!res.ok) throw new Error()
        const { data } = await res.json()
        if (!controller.signal.aborted) setPost(data)
      } catch {
        if (!controller.signal.aborted) setLoadState('error')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [params.id, reload])

  const handleLike = async () => {
    if (!post || liking) return
    setLiking(true)
    try {
      const res = await fetch("/api/community/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed")
      }
      const { liked } = await res.json()
      setPost((prev) =>
        prev
          ? {
              ...prev,
              liked,
              _count: {
                ...prev._count,
                likes: prev._count.likes + (liked ? 1 : -1),
              },
            }
          : prev,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setLiking(false)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !post) return

    setCommenting(true)
    try {
      const res = await fetch("/api/community/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, content: comment.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to comment")
      }
      const { data } = await res.json()
      setPost((prev) =>
        prev ? { ...prev, comments: [...prev.comments, data] } : prev,
      )
      setComment("")
      toast.success("Comment added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to comment")
    } finally {
      setCommenting(false)
    }
  }

  // Edit post
  const startEditPost = () => {
    if (!post) return
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditingPost(true)
  }

  const savePostEdit = async () => {
    if (!post || !editTitle.trim() || !editContent.trim()) return
    setSavingPostEdit(true)
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim() }),
      })
      if (!res.ok) throw new Error("Failed to update post")
      const { data } = await res.json()
      setPost((prev) => prev ? { ...prev, title: data.title, content: data.content } : prev)
      setEditingPost(false)
      toast.success("Post updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setSavingPostEdit(false)
    }
  }

  // Delete post
  const handleDeletePost = async () => {
    if (!post || !confirm("Are you sure you want to delete this post?")) return
    try {
      const res = await fetch(`/api/community/posts/${post.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete post")
      toast.success("Post deleted")
      router.push("/community")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  // Edit comment
  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id)
    setEditCommentContent(c.content)
  }

  const saveCommentEdit = async () => {
    if (!editingCommentId || !editCommentContent.trim()) return
    setSavingCommentEdit(true)
    try {
      const res = await fetch("/api/community/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: editingCommentId, content: editCommentContent.trim() }),
      })
      if (!res.ok) throw new Error("Failed to update comment")
      const { data } = await res.json()
      setPost((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === editingCommentId ? { ...c, content: data.content } : c,
              ),
            }
          : prev,
      )
      setEditingCommentId(null)
      toast.success("Comment updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    } finally {
      setSavingCommentEdit(false)
    }
  }

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return
    try {
      const res = await fetch("/api/community/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      })
      if (!res.ok) throw new Error("Failed to delete comment")
      setPost((prev) =>
        prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : prev,
      )
      toast.success("Comment deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  // Report
  const submitReport = async () => {
    if (reporting) return
    if (!reportTarget || reportReason.trim().length < 5) {
      toast.error("Please provide a reason (at least 5 characters)")
      return
    }
    setReporting(true)
    try {
      const res = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: reportTarget.type,
          targetId: reportTarget.id,
          reason: reportReason.trim(),
        }),
      })
      if (!res.ok && res.status !== 409) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to report")
      }
      setPost(previous => previous ? {
        ...previous,
        ...(reportTarget.type === 'post' ? { hasPendingReport: true } : {}),
        comments: previous.comments.map(item => reportTarget.type === 'comment' && item.id === reportTarget.id ? { ...item, hasPendingReport: true } : item),
      } : previous)
      setReportNotice(res.status === 409 ? 'You already have a pending report for this content.' : 'Your report was submitted for moderator review. Thank you.')
      setReportTarget(null)
      setReportReason("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to report")
    } finally {
      setReporting(false)
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading discussion" className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="container mx-auto p-6 max-w-3xl text-center space-y-4">
        <h1 className="text-2xl font-semibold">{loadState === 'signed-out' ? 'Sign in to read this discussion' : loadState === 'error' ? 'We couldn’t load the discussion' : 'This discussion is unavailable'}</h1>
        <p className="text-muted-foreground">{loadState === 'missing' ? 'It may have been removed or is no longer available.' : loadState === 'error' ? 'Please try again in a moment.' : 'Community discussions are available to signed-in members.'}</p>
        {loadState === 'signed-out' && <Button asChild><Link href="/auth/signin">Sign in</Link></Button>}
        {loadState === 'error' && <Button onClick={() => setReload(value => value + 1)}>Try again</Button>}
        <Button asChild variant="outline" className="mt-4">
          <Link href="/community">Back to Community</Link>
        </Button>
      </div>
    )
  }

  const isAuthor = currentUserId === post.user.id

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/community">← Back</Link>
      </Button>
      {reportNotice && <p role="status" className="rounded-lg border bg-muted/20 p-4 text-sm">{reportNotice}</p>}

      {/* Post */}
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={post.user.image || ""} />
              <AvatarFallback>
                {post.user.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{post.user.name || "Anonymous"}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </p>
            </div>
            {post.isPinned && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Pin className="w-3 h-3" /> Pinned
              </Badge>
            )}
          </div>

          {/* Topic + Tags */}
          <div className="flex flex-wrap gap-1.5">
            {post.topic && <Link href={`/community/topic/${encodeURIComponent(post.topic.slug)}`}><Badge variant="outline">{post.topic.name}</Badge></Link>}
            {post.tags.map((pt) => (
              <Link key={pt.tag.id} href={`/community/tag/${encodeURIComponent(pt.tag.slug)}`}><Badge variant="secondary" className="text-xs">
                {pt.tag.name}
              </Badge></Link>
            ))}
          </div>

          {/* Editable or display */}
          {editingPost ? (
            <div className="space-y-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-lg font-bold"
              />
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={5000}
                className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={savePostEdit} disabled={savingPostEdit}>
                  {savingPostEdit ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingPost(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold">{post.title}</h1>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
            </>
          )}

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button
              variant={post.liked ? "default" : "outline"}
              size="sm"
              onClick={handleLike}
              disabled={liking}
            >
              <Heart className={`w-4 h-4 mr-1 ${post.liked ? "fill-current" : ""}`} />
              {post._count.likes}
            </Button>

            {/* Author actions */}
            {isAuthor && !editingPost && (
              <>
                <Button variant="ghost" size="sm" onClick={startEditPost}>
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeletePost}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              </>
            )}

            {/* Report (not for own posts) */}
            {!isAuthor && (
              <Button
                variant="ghost"
                size="sm"
                disabled={post.hasPendingReport}
                aria-label={post.hasPendingReport ? 'Discussion already reported' : 'Report discussion'}
                onClick={() => setReportTarget({ type: "post", id: post.id })}
              >
                <Flag className="w-4 h-4 mr-1" /> {post.hasPendingReport ? 'Reported' : 'Report'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Dialog (inline) */}
      {reportTarget && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-medium">
              Report this {reportTarget.type}
            </p>
            <label htmlFor="community-report-reason" className="sr-only">Reason for reporting</label>
            <textarea
              id="community-report-reason"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Why are you reporting this? (min 5 characters)"
              maxLength={500}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={submitReport}
                disabled={reporting || reportReason.trim().length < 5}
              >
                {reporting ? "Submitting…" : "Submit Report"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setReportTarget(null); setReportReason("") }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Comments ({post.comments.length})
        </h2>

        {post.comments.map((c) => (
          <Card key={c.id} id={`comment-${c.id}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-3">
                <Avatar className="w-7 h-7 mt-0.5">
                  <AvatarImage src={c.user.image || ""} />
                  <AvatarFallback className="text-xs">
                    {c.user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{c.user.name || "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  {editingCommentId === c.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editCommentContent}
                        onChange={(e) => setEditCommentContent(e.target.value)}
                        maxLength={2000}
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveCommentEdit} disabled={savingCommentEdit}>
                          {savingCommentEdit ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                      <div className="flex items-center gap-1 pt-1">
                        {currentUserId === c.user.id && (
                          <>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => startEditComment(c)}>
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => handleDeleteComment(c.id)}>
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          </>
                        )}
                        {currentUserId !== c.user.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={c.hasPendingReport}
                            aria-label={c.hasPendingReport ? 'Comment already reported' : 'Report comment'}
                            onClick={() => setReportTarget({ type: "comment", id: c.id })}
                          >
                            <Flag className="w-3 h-3 mr-1" /> {c.hasPendingReport ? 'Reported' : 'Report'}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add comment */}
        <Card>
          <CardContent className="py-4">
            <form onSubmit={handleComment} className="space-y-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment…"
                maxLength={2000}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="submit" size="sm" disabled={commenting || !comment.trim()}>
                {commenting ? "Posting…" : "Post Comment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
