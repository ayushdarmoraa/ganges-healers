'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ArticleBody from '@/components/blog/ArticleBody'
import { isAllowedArticleImage } from '@/config/images'
import type { BlogArticle } from '@/lib/blog/admin'

interface Form { title: string; slug: string; content: string; excerpt: string; imageUrl: string }
type Decision = 'publish' | 'unpublish' | 'save-live' | 'reload' | 'discard' | 'leave'
const blank: Form = { title: '', slug: '', content: '', excerpt: '', imageUrl: '' }
const formOf = (article: BlogArticle): Form => ({ title: article.title, slug: article.slug, content: article.content, excerpt: article.excerpt || '', imageUrl: article.imageUrl || '' })
const slugOf = (title: string) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '')
const decisions: Record<Decision, { title: string; explanation: string; button: string }> = {
  publish: { title: 'Publish this article?', explanation: 'The saved article will become public in the blog, homepage, search, and sitemap.', button: 'Confirm publish' },
  unpublish: { title: 'Unpublish this article?', explanation: 'This removes the article from public views. Its content and URL are kept so it can be published again.', button: 'Confirm unpublish' },
  'save-live': { title: 'Save changes to the public article?', explanation: 'These changes will become visible to readers as soon as they are saved.', button: 'Save live changes' },
  reload: { title: 'Reload the saved version?', explanation: 'This discards your unsaved edits. Copy any text you want to keep before reloading.', button: 'Reload saved version' },
  discard: { title: 'Discard your unsaved changes?', explanation: 'The editor will return to the last saved article. The saved article stays unchanged.', button: 'Discard changes' },
  leave: { title: 'Leave without saving?', explanation: 'Your unsaved edits will be lost. The last saved article stays unchanged.', button: 'Leave editor' },
}

export default function BlogEditor({ articleId }: { articleId?: string }) {
  const router = useRouter()
  const [saved, setSaved] = useState<BlogArticle | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(!!articleId)
  const [loadState, setLoadState] = useState<'error' | 'missing' | 'forbidden' | null>(null)
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)
  const original = saved ? formOf(saved) : blank
  const dirty = (Object.keys(form) as Array<keyof Form>).some(field => form[field] !== original[field])

  useEffect(() => {
    if (!articleId) return
    const controller = new AbortController()
    setLoading(true); setLoadState(null); setError(null); setConflict(false)
    async function load() {
      try {
        const response = await fetch(`/api/admin/blog?id=${encodeURIComponent(articleId!)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 404) { setLoadState('missing'); return }
        if (response.status === 401 || response.status === 403) { setLoadState('forbidden'); return }
        if (!response.ok) throw new Error()
        const body = await response.json()
        if (controller.signal.aborted) return
        if (!body.data || typeof body.data.version !== 'string' || typeof body.data.content !== 'string') throw new Error()
        setSaved(body.data); setForm(formOf(body.data)); setSlugEdited(true)
      } catch { if (!controller.signal.aborted) setLoadState('error') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [articleId, reload])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function change(field: keyof Form, value: string) { setForm(previous => ({ ...previous, [field]: value })) }

  async function write(published?: boolean) {
    if (saving) return
    if (!form.title.trim() || (!saved && !form.slug)) { setError('Add an article title and URL slug before saving.'); return }
    if (!isAllowedArticleImage(form.imageUrl.trim())) { setError('Use an HTTPS image from the supported image hosts, or leave the cover image empty.'); return }
    setSaving(true); setError(null); setConflict(false)
    try {
      const fields = { title: form.title.trim(), content: form.content, excerpt: form.excerpt.trim(), imageUrl: form.imageUrl.trim() }
      const payload = saved
        ? { id: saved.id, version: saved.version, changes: published === undefined ? fields : { published } }
        : { ...fields, slug: form.slug }
      const response = await fetch('/api/admin/blog', { method: saved ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw Object.assign(new Error(body.error || 'The article could not be saved. Please try again.'), { status: response.status, code: body.code })
      if (!body.data?.id || typeof body.data.version !== 'string') throw new Error('The save could not be confirmed. Reload the saved version before retrying.')
      setSaved(body.data); setForm(formOf(body.data)); setDecision(null)
      toast.success(body.idempotent ? 'The article is already up to date.' : published === true ? 'Article published.' : published === false ? 'Article unpublished. Your content is kept as a draft.' : saved?.published ? 'Public article updated.' : 'Draft saved.')
      if (!saved) router.replace(`/admin/blog/${body.data.id}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The article could not be saved. Please try again.')
      setConflict(!!failure && typeof failure === 'object' && 'code' in failure && failure.code === 'ARTICLE_CHANGED')
    } finally { setSaving(false) }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saved?.published && dirty) { setError(null); setDecision('save-live') }
    else void write()
  }

  function confirm() {
    if (!decision || saving) return
    if (decision === 'publish') void write(true)
    else if (decision === 'unpublish') void write(false)
    else if (decision === 'save-live') void write()
    else if (decision === 'discard' && saved) { setForm(formOf(saved)); setDecision(null); setError(null); setConflict(false) }
    else if (decision === 'reload') { setDecision(null); setReload(value => value + 1) }
    else if (decision === 'leave') { setDecision(null); router.push('/admin/blog') }
  }

  function articlePreview() {
    return <article aria-label="Article preview" className="rounded-lg border bg-muted/10 p-5 space-y-5">
      <p className="text-xs text-muted-foreground">Preview · Only you can see unsaved changes</p>
      {form.imageUrl && isAllowedArticleImage(form.imageUrl) && <Image src={form.imageUrl} alt={form.title || 'Article cover'} width={800} height={400} className="h-56 w-full rounded-lg object-cover" />}
      <h2 className="text-3xl font-bold break-words">{form.title.trim() || 'Untitled article'}</h2>
      <ArticleBody content={form.content || 'Your article content will appear here.'} />
    </article>
  }

  if (loading) return <p role="status" className="container mx-auto p-6 py-16 text-center">Loading article…</p>
  if (loadState) return <div className="container mx-auto max-w-3xl p-6 py-16 text-center space-y-4"><h1 className="text-2xl font-semibold">{loadState === 'missing' ? 'Article not found' : loadState === 'forbidden' ? 'Article management is not available to this account' : 'We couldn’t load the article'}</h1>{loadState === 'error' && <Button onClick={() => setReload(value => value + 1)}>Try again</Button>}<p><Link href="/admin/blog" className="text-primary underline">Back to articles</Link></p></div>

  return <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" disabled={saving} onClick={() => dirty ? setDecision('leave') : router.push('/admin/blog')}>← Back to articles</Button>{saved?.published && <Link href={`/blog/${encodeURIComponent(saved.slug)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Open public article</Link>}</div>
    <header className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{saved ? 'Edit article' : 'New article'}</h1><Badge variant={saved?.published ? 'outline' : 'secondary'}>{saved?.published ? 'Published' : 'Draft'}</Badge></div><p className="text-sm text-muted-foreground">{saved?.published ? 'Changes to this published article go live when you confirm and save them.' : 'Drafts are private to admins until you explicitly publish them.'}</p><p role="status" className="text-sm text-muted-foreground">{dirty ? 'Unsaved changes' : saved ? `Saved · ${new Date(saved.updatedAt).toLocaleString()}` : 'Not saved yet'}</p></header>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" aria-label="Article editor view"><Button variant={preview ? 'outline' : 'default'} aria-pressed={!preview} onClick={() => setPreview(false)}>Write</Button><Button variant={preview ? 'default' : 'outline'} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</Button></div><div className="flex flex-wrap gap-2">{saved && dirty && <Button variant="ghost" disabled={saving} onClick={() => setDecision('discard')}>Discard changes</Button>}<Button type="submit" form="blog-article-form" disabled={saving || (!!saved && !dirty)}>{saving ? 'Saving…' : saved?.published ? 'Save live changes' : 'Save draft'}</Button>{saved && <Button variant="outline" disabled={saving || dirty || (!saved.published && !saved.content.trim())} onClick={() => { setError(null); setDecision(saved.published ? 'unpublish' : 'publish') }}>{saved.published ? 'Unpublish' : 'Publish'}</Button>}</div></div>
    {saved && dirty && <p className="text-xs text-muted-foreground">Save or discard your edits before changing publication status.</p>}
    {error && !decision && <div role="alert" className="rounded-lg border p-4 space-y-2"><p>{error}</p>{conflict && <Button variant="outline" onClick={() => setDecision('reload')}>Reload saved version</Button>}</div>}
    <form id="blog-article-form" onSubmit={submit} className="space-y-5">
      {preview ? articlePreview() : <>
        <div className="space-y-2"><Label htmlFor="article-title">Title</Label><Input id="article-title" value={form.title} required maxLength={200} disabled={saving} onChange={event => { const title = event.target.value; setForm(previous => ({ ...previous, title, ...(!saved && !slugEdited ? { slug: slugOf(title) } : {}) })) }} /></div>
        <div className="space-y-2"><Label htmlFor="article-slug">URL slug</Label><Input id="article-slug" value={form.slug} required readOnly={!!saved} maxLength={100} pattern={saved ? undefined : '[a-z0-9]+(-[a-z0-9]+)*'} disabled={saving} onChange={event => { setSlugEdited(true); change('slug', event.target.value.toLowerCase()) }} /><p className="text-xs text-muted-foreground break-all">/blog/{form.slug || 'your-article'} · {saved ? 'This address stays the same.' : 'Choose this before the first save; the address is permanent.'}</p></div>
        <div className="space-y-2"><Label htmlFor="article-excerpt">Summary</Label><textarea id="article-excerpt" value={form.excerpt} maxLength={500} disabled={saving} onChange={event => change('excerpt', event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /><p className="text-xs text-muted-foreground">Used in article lists and page descriptions. Optional, up to 500 characters.</p></div>
        <div className="space-y-2"><Label htmlFor="article-image">Cover image URL</Label><Input id="article-image" value={form.imageUrl} maxLength={2000} disabled={saving} onChange={event => change('imageUrl', event.target.value)} /><p className="text-xs text-muted-foreground">Optional HTTPS image from your Vercel storage or the existing Google/GitHub image hosts.</p></div>
        <div className="space-y-2"><Label htmlFor="article-content">Article content</Label><textarea id="article-content" value={form.content} maxLength={50000} disabled={saving} onChange={event => change('content', event.target.value)} className="min-h-80 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed" /><p className="text-xs text-muted-foreground">Plain text with line breaks. HTML is shown as text. {form.content.length.toLocaleString()}/50,000 characters.</p></div>
      </>}
    </form>
    <Dialog open={!!decision} onOpenChange={open => { if (!open && !saving) setDecision(null) }}><DialogContent showCloseButton={!saving} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      {decision && <><DialogHeader><DialogTitle>{decisions[decision].title}</DialogTitle><DialogDescription>{decisions[decision].explanation}</DialogDescription></DialogHeader>{['publish', 'save-live'].includes(decision) && articlePreview()}{error && decision !== 'reload' && <div role="alert" className="rounded-lg border p-3 space-y-2"><p>{error}</p>{conflict && <Button variant="outline" onClick={() => setDecision('reload')}>Reload saved version</Button>}</div>}<DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDecision(null)}>Keep editing</Button><Button disabled={saving} onClick={confirm}>{saving ? 'Saving…' : decisions[decision].button}</Button></DialogFooter></>}
    </DialogContent></Dialog>
  </div>
}
