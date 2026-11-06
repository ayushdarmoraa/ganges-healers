'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { courseDetailSchema, courseFieldsSchema, courseSummarySchema, createCourseSchema, lessonFieldsSchema, type CourseChange, type CourseDetail, type CourseSummary } from '@/lib/courses/admin-schema'

const listSchema = z.object({ success: z.literal(true), data: z.array(courseSummarySchema), nextCursor: z.string().nullable() })
const detailSchema = z.object({ success: z.literal(true), data: courseDetailSchema })
async function responseBody(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(typeof body?.error === 'string' ? body.error : 'Course management is unavailable. Please try again.'), { code: body?.code })
  return body
}
const blankCourse = { title: '', slug: '', description: '', pricePaise: 0, imageUrl: '' }
const blankLesson = { title: '', videoUrl: '', content: '' }

export default function CourseManager() {
  const { data: session, status: authStatus } = useSession()
  const userId = session?.user?.id ?? ''
  const canManage = session?.user?.role === 'ADMIN'
  const owner = useRef(userId); owner.current = canManage ? userId : ''
  const [rows, setRows] = useState<CourseSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState('')
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(''), [creating, setCreating] = useState(false), [revision, setRevision] = useState(0)
  const more = useRef<AbortController | null>(null)
  const params = new URLSearchParams({ q: query, status, limit: '25' }).toString()
  useEffect(() => { setSelected(''); setCreating(false) }, [userId, canManage])
  useEffect(() => {
    const controller = new AbortController()
    more.current?.abort(); more.current = null
    setRows([]); setCursor(null); setLoading(true); setLoadingMore(false); setError('')
    if (authStatus === 'loading') return () => controller.abort()
    if (!userId || !canManage) { setLoading(false); setError('Sign in with an administrator account.'); return () => controller.abort() }
    fetch(`/api/admin/courses?${params}`, { signal: controller.signal, cache: 'no-store' }).then(responseBody).then(body => {
      const parsed = listSchema.safeParse(body)
      if (!parsed.success) throw new Error('Saved courses could not be confirmed. Please retry.')
      if (!controller.signal.aborted) { setRows(parsed.data.data); setCursor(parsed.data.nextCursor) }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Courses could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); more.current?.abort(); more.current = null }
  }, [userId, canManage, authStatus, params, revision])
  async function loadMore() {
    if (!cursor || loading || more.current) return
    const controller = new AbortController(); more.current = controller; setLoadingMore(true); setError('')
    try {
      const next = new URLSearchParams(params); next.set('cursor', cursor)
      const parsed = listSchema.parse(await responseBody(await fetch(`/api/admin/courses?${next}`, { signal: controller.signal, cache: 'no-store' })))
      if (!controller.signal.aborted) { setRows(previous => [...new Map([...previous, ...parsed.data].map(row => [row.id, row])).values()]); setCursor(parsed.nextCursor) }
    } catch { if (!controller.signal.aborted) setError('More courses could not be loaded. Your current results are preserved; try again.') }
    finally { if (!controller.signal.aborted) { more.current = null; setLoadingMore(false) } }
  }
  function saved(row: CourseDetail, actor: string) {
    if (actor !== owner.current) return
    setRows(previous => previous.map(item => item.id === row.id ? row : item))
  }
  return <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
    <nav className="flex gap-4 text-sm"><Link href="/admin" className="underline">← Admin</Link><Link href="/courses" className="underline">Course catalog</Link></nav>
    <header className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="text-3xl font-semibold">Manage Courses</h1><p className="mt-2 text-muted-foreground">Create a draft, add lessons, and publish when your curriculum is ready.</p></div><Button disabled={!canManage || !!selected} onClick={() => setCreating(value => !value)}>{creating ? 'Close new course' : 'New course'}</Button></header>
    {creating && userId && <NewCourse key={userId} onCreated={row => { if (owner.current !== userId) return; setRows(previous => [row, ...previous.filter(item => item.id !== row.id)]); setSelected(row.id); setCreating(false) }} />}
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setQuery(search.trim()) }}>
      <label className="grid gap-1 text-sm">Search courses<Input value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Course status<select className="h-9 rounded-md border bg-background px-3" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All</option><option value="draft">Drafts and archived</option><option value="published">Published</option></select></label>
      <Button type="submit" variant="outline">Search</Button>{query && <Button type="button" variant="ghost" onClick={() => { setSearch(''); setQuery('') }}>Clear search</Button>}
    </form>
    {error && <div role="alert" className="rounded border p-4 space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry courses</Button></div>}
    {loading ? <p role="status">Loading courses…</p> : <div className="space-y-3">
      {!rows.length && !error && <p className="rounded border p-6">No courses match these filters.</p>}
      {rows.map(row => <article key={row.id} className="rounded-lg border p-4 space-y-2" aria-label={row.title}>
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold break-words">{row.title}</h2><span className="text-sm">{row.isActive ? 'Published' : 'Draft / archived'}</span></div>
        <p className="text-sm text-muted-foreground break-all">/courses/{row.slug} · ₹{(row.pricePaise / 100).toLocaleString('en-IN')} · {row.lessonCount} lessons · {row.enrollmentCount} enrollments</p>
        <Button variant="outline" size="sm" disabled={!!selected && selected !== row.id} onClick={() => setSelected(row.id)} aria-label={`Manage ${row.title}`}>Manage lessons and details</Button>
      </article>)}
      {cursor && <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load more courses'}</Button>}
    </div>}
    {selected && userId && <CourseEditor key={`${userId}:${selected}`} id={selected} onClose={() => setSelected('')} onSaved={row => saved(row, userId)} onDeleted={() => { setRows(previous => previous.filter(row => row.id !== selected)); setSelected('') }} />}
  </div>
}

function NewCourse({ onCreated }: { onCreated: (row: CourseDetail) => void }) {
  const [fields, setFields] = useState(blankCourse), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const live = useRef(true), submitting = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  async function submit() {
    if (submitting.current) return
    const parsed = createCourseSchema.safeParse(fields)
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    submitting.current = true; setBusy(true); setError('')
    try {
      const result = detailSchema.parse(await responseBody(await fetch('/api/admin/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) })))
      if (live.current) onCreated(result.data)
    } catch (failure) { if (live.current) setError(failure instanceof z.ZodError ? 'The new course was not confirmed. Your draft is preserved; check the course list before trying again.' : failure instanceof Error ? failure.message : 'Course creation failed.') }
    finally { submitting.current = false; if (live.current) setBusy(false) }
  }
  return <section className="rounded-lg border p-5 space-y-4" aria-label="New course draft"><h2 className="text-xl font-semibold">New course draft</h2>{error && <p role="alert">{error}</p>}<form onSubmit={event => { event.preventDefault(); void submit() }} className="space-y-3">
    <CourseFields fields={fields} disabled={busy} onChange={next => setFields(previous => ({ ...previous, ...next }))} />
    <label className="grid gap-1 text-sm">URL slug<Input value={fields.slug} onChange={event => setFields(previous => ({ ...previous, slug: event.target.value }))} required maxLength={100} disabled={busy} /></label>
    <Button disabled={busy} type="submit">{busy ? 'Creating…' : 'Create draft'}</Button>
  </form></section>
}

function CourseFields({ fields, disabled, onChange }: { fields: z.infer<typeof courseFieldsSchema>; disabled: boolean; onChange: (change: Partial<z.infer<typeof courseFieldsSchema>>) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm">Course title<Input required maxLength={200} value={fields.title} onChange={event => onChange({ title: event.target.value })} disabled={disabled} /></label>
    <label className="grid gap-1 text-sm">Price (paise)<Input type="number" required min={0} max={2147483647} step={1} value={Number.isNaN(fields.pricePaise) ? '' : fields.pricePaise} onChange={event => onChange({ pricePaise: event.target.value === '' ? Number.NaN : Number(event.target.value) })} disabled={disabled} /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Cover image URL (optional)<Input type="url" maxLength={2000} value={fields.imageUrl} onChange={event => onChange({ imageUrl: event.target.value })} disabled={disabled} /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Course description<textarea required maxLength={20000} className="min-h-24 rounded-md border bg-background p-3" value={fields.description} onChange={event => onChange({ description: event.target.value })} disabled={disabled} /></label>
  </div>
}

function CourseEditor({ id, onSaved, onDeleted, onClose }: { id: string; onSaved: (row: CourseDetail) => void; onDeleted: () => void; onClose: () => void }) {
  const [course, setCourse] = useState<CourseDetail | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false), [revision, setRevision] = useState(0)
  const [deleteChecked, setDeleteChecked] = useState(false), [confirmClose, setConfirmClose] = useState(false)
  const [dirtyForms, setDirtyForms] = useState<Record<string, boolean>>({})
  const hasDirty = Object.values(dirtyForms).some(Boolean)
  const trackDirty = useCallback((key: string, value: boolean) => setDirtyForms(previous => previous[key] === value ? previous : { ...previous, [key]: value }), [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasDirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDirty])
  const live = useRef(true), submitting = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setConflict(false); setMessage(''); setCourse(null); setDeleteChecked(false); setDirtyForms({})
    fetch(`/api/admin/courses?${new URLSearchParams({ id })}`, { signal: controller.signal, cache: 'no-store' }).then(responseBody).then(body => {
      const saved = detailSchema.parse(body)
      if (saved.data.id !== id) throw new Error('The requested saved course could not be confirmed. Please retry.')
      if (!controller.signal.aborted) setCourse(saved.data)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error && !(failure instanceof z.ZodError) ? failure.message : 'The saved course could not be confirmed. Please retry.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, revision])
  async function act(change: CourseChange, remove = false): Promise<boolean> {
    if (!course || conflict || submitting.current) return false
    submitting.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const body = await responseBody(await fetch('/api/admin/courses', { method: remove ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: course.id, version: course.version, ...(remove ? {} : { change }) }) }))
      if (!live.current) return false
      if (remove) {
        if (body?.success !== true || body?.data?.deleted !== true || body.data.id !== course.id) throw new Error('Deletion was not confirmed. Reload the saved course before trying again.')
        onDeleted(); return true
      }
      const result = detailSchema.parse(body)
      if (result.data.id !== course.id) throw new Error('The saved course was not confirmed.')
      setCourse(result.data); onSaved(result.data); setMessage('Course saved.'); return true
    } catch (failure) {
      if (live.current) {
        if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'COURSE_CHANGED') setConflict(true)
        setError(failure instanceof z.ZodError ? 'The save was not confirmed. Your draft is preserved; reload the saved version before trying again.' : failure instanceof Error ? failure.message : 'The save failed. Your draft is preserved.')
      }
      return false
    } finally { submitting.current = false; if (live.current) setBusy(false) }
  }
  const disabled = busy || conflict
  const protectedCourse = !!course?.enrollmentCount
  return <section className="rounded-lg border p-5 space-y-5" aria-label="Course editor">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="text-2xl font-semibold">{course ? `Edit ${course.title}` : 'Course editor'}</h2><Button variant="ghost" onClick={() => hasDirty ? setConfirmClose(true) : onClose()} disabled={busy}>Close editor</Button></div>
    {error && <div role="alert" className="rounded border p-3 space-y-2"><p>{error}</p>{conflict || !course ? <Button variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>{conflict ? 'Discard draft and reload saved course' : 'Retry saved course'}</Button> : null}</div>}
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading saved course…</p> : course && <div key={revision} className="space-y-6">
      <p className="text-sm text-muted-foreground">{course.isActive ? 'Published' : 'Draft / archived'} · {course.enrollmentCount} enrollments. Archiving stops new enrollments; existing students keep lesson access. The URL slug stays fixed.</p>
      <DetailsForm course={course} onDirty={trackDirty} disabled={disabled} onSave={fields => act({ action: 'details', fields })} />
      <div className="flex flex-wrap gap-3"><Button disabled={disabled || hasDirty} variant="outline" onClick={() => void act({ action: course.isActive ? 'archive' : 'publish' })}>{course.isActive ? 'Archive course' : 'Publish course'}</Button>{course.isActive && <Link className="text-sm underline self-center" href={`/courses/${encodeURIComponent(course.slug)}`} target="_blank" rel="noopener noreferrer">Open public course</Link>}</div>
      {hasDirty && <p className="text-sm text-muted-foreground">Save pending course and lesson changes before publishing or archiving.</p>}
      <div className="space-y-4"><h3 className="text-xl font-semibold">Lessons</h3>{protectedCourse && <p className="text-sm">Enrollment records protect this curriculum: lesson text and video may be corrected, while adding, removing, or reordering lessons is locked.</p>}
        {!course.lessons.length && <p>No lessons yet. Add lesson text or an HTTPS video URL before publishing.</p>}
        {course.lessons.map((lesson, index) => <LessonEditor key={lesson.id} onDirty={trackDirty} lesson={lesson} index={index} total={course.lessons.length} disabled={disabled} protectedCourse={protectedCourse} onSave={fields => act({ action: 'edit_lesson', lessonId: lesson.id, fields })} onRemove={() => act({ action: 'delete_lesson', lessonId: lesson.id })} onMove={offset => { const ids = course.lessons.map(row => row.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]; return act({ action: 'reorder_lessons', lessonIds: ids }) }} />)}
        {!protectedCourse && <div className="rounded border p-4"><h4 className="font-semibold mb-3">Add lesson</h4><LessonForm onDirty={trackDirty} disabled={disabled} onSave={fields => act({ action: 'add_lesson', fields })} /></div>}
      </div>
      {!protectedCourse && !course.isActive && <details className="rounded border border-destructive p-4 space-y-3"><summary className="cursor-pointer font-medium">Delete unpurchased draft</summary><p className="text-sm">This permanently removes the draft and its lessons. Courses with enrollment or payment records cannot be deleted.</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={deleteChecked} onChange={event => setDeleteChecked(event.target.checked)} disabled={disabled} />I understand this draft and its lessons will be deleted.</label><Button variant="destructive" disabled={disabled || hasDirty || !deleteChecked} onClick={() => void act({ action: 'archive' }, true)}>Delete draft permanently</Button></details>}
    </div>}
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent><DialogHeader><DialogTitle>Discard unsaved course changes?</DialogTitle><DialogDescription>Your saved course will stay as it is. Unsaved text in this editor will be lost.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button><Button variant="destructive" onClick={onClose}>Discard draft and close</Button></div></DialogContent></Dialog>
  </section>
}

function DetailsForm({ course, disabled, onSave, onDirty }: { course: CourseDetail; disabled: boolean; onDirty: (key: string, dirty: boolean) => void; onSave: (fields: z.infer<typeof courseFieldsSchema>) => Promise<boolean> }) {
  const [fields, setFields] = useState({ title: course.title, description: course.description, pricePaise: course.pricePaise, imageUrl: course.imageUrl ?? '' }), [error, setError] = useState('')
  useEffect(() => { setFields({ title: course.title, description: course.description, pricePaise: course.pricePaise, imageUrl: course.imageUrl ?? '' }) }, [course.title, course.description, course.pricePaise, course.imageUrl])
  useEffect(() => { onDirty('details', fields.title !== course.title || fields.description !== course.description || fields.pricePaise !== course.pricePaise || fields.imageUrl !== (course.imageUrl ?? '')) }, [fields, course.title, course.description, course.pricePaise, course.imageUrl, onDirty])
  return <form className="space-y-3" aria-label="Course details" onSubmit={event => { event.preventDefault(); const parsed = courseFieldsSchema.safeParse(fields); if (!parsed.success) { setError(parsed.error.issues[0].message); return } setError(''); void onSave(parsed.data) }}>
    {error && <p role="alert">{error}</p>}<CourseFields fields={fields} onChange={next => setFields(previous => ({ ...previous, ...next }))} disabled={disabled} /><Button type="submit" disabled={disabled}>Save course details</Button>
  </form>
}

function LessonForm({ lesson, disabled, onSave, onDirty }: { lesson?: CourseDetail['lessons'][number]; disabled: boolean; onDirty: (key: string, dirty: boolean) => void; onSave: (fields: z.infer<typeof lessonFieldsSchema>) => Promise<boolean> }) {
  const [fields, setFields] = useState(lesson ? { title: lesson.title, videoUrl: lesson.videoUrl ?? '', content: lesson.content ?? '' } : blankLesson), [error, setError] = useState('')
  const formId = useId()
  const lessonTitle = lesson?.title, lessonVideo = lesson?.videoUrl ?? '', lessonContent = lesson?.content ?? ''
  useEffect(() => { if (lessonTitle !== undefined) setFields({ title: lessonTitle, videoUrl: lessonVideo, content: lessonContent }) }, [lessonTitle, lessonVideo, lessonContent])
  const dirtyKey = lesson?.id ?? 'new-lesson'
  useEffect(() => { onDirty(dirtyKey, fields.title !== (lessonTitle ?? '') || fields.videoUrl !== lessonVideo || fields.content !== lessonContent); return () => onDirty(dirtyKey, false) }, [dirtyKey, fields, lessonTitle, lessonVideo, lessonContent, onDirty])
  return <form className="space-y-3" aria-label={lesson ? `Edit lesson ${lesson.title}` : 'New lesson'} onSubmit={event => { event.preventDefault(); const parsed = lessonFieldsSchema.safeParse(fields); if (!parsed.success) { setError(parsed.error.issues[0].message); return } setError(''); void onSave(parsed.data).then(saved => { if (saved && !lesson) setFields(blankLesson) }) }}>
    {error && <p role="alert">{error}</p>}<div className="grid gap-1"><Label htmlFor={`${formId}-title`}>Lesson title</Label><Input id={`${formId}-title`} required maxLength={200} value={fields.title} disabled={disabled} onChange={event => setFields(previous => ({ ...previous, title: event.target.value }))} /></div>
    <div className="grid gap-1"><Label htmlFor={`${formId}-video`}>Video or embed URL (optional)</Label><Input id={`${formId}-video`} type="url" maxLength={2000} value={fields.videoUrl} disabled={disabled} onChange={event => setFields(previous => ({ ...previous, videoUrl: event.target.value }))} /></div>
    <div className="grid gap-1"><Label htmlFor={`${formId}-content`}>Lesson text</Label><textarea id={`${formId}-content`} maxLength={50000} className="min-h-32 rounded-md border bg-background p-3" value={fields.content} disabled={disabled} onChange={event => setFields(previous => ({ ...previous, content: event.target.value }))} /></div>
    <Button type="submit" disabled={disabled}>{lesson ? 'Save lesson' : 'Add lesson'}</Button>
  </form>
}

function LessonEditor({ lesson, index, total, disabled, protectedCourse, onSave, onRemove, onMove, onDirty }: {
  onDirty: (key: string, dirty: boolean) => void
  lesson: CourseDetail['lessons'][number]; index: number; total: number; disabled: boolean; protectedCourse: boolean
  onSave: (fields: z.infer<typeof lessonFieldsSchema>) => Promise<boolean>; onRemove: () => Promise<boolean>; onMove: (offset: number) => Promise<boolean>
}) {
  const [removing, setRemoving] = useState(false)
  return <article className="rounded border p-4 space-y-3" aria-label={`Lesson ${index + 1}: ${lesson.title}`}>
    <h4 className="font-medium">{index + 1}. {lesson.title}</h4><LessonForm lesson={lesson} onDirty={onDirty} disabled={disabled} onSave={onSave} />
    {!protectedCourse && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={disabled || index === 0} aria-label={`Move ${lesson.title} up`} onClick={() => void onMove(-1)}>Move up</Button><Button variant="outline" size="sm" disabled={disabled || index === total - 1} aria-label={`Move ${lesson.title} down`} onClick={() => void onMove(1)}>Move down</Button>{removing ? <><span className="self-center text-sm">Remove this lesson?</span><Button variant="destructive" size="sm" disabled={disabled} onClick={() => void onRemove()}>Remove permanently</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => setRemoving(false)}>Keep lesson</Button></> : <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setRemoving(true)}>Remove lesson</Button>}</div>}
  </article>
}
