import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { writeProgramCatalog, archiveProgramCatalog } from '@/lib/programs/queries'
import { CatalogEditor } from '@/components/admin/catalog-editor'

const invalidProgram = 'Check the title, description and numbers. Use a positive program price, 1–366 sessions, 1–7 sessions per week and 1–1440 minutes per session.'
const duplicateSlug = 'That program slug is already in use.'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  return session
}

function programForm(formData: FormData) {
  return Object.fromEntries(['title', 'slug', 'description', 'pricePaise', 'totalSessions', 'sessionsPerWeek', 'durationMinutes'].map(key => [key, formData.get(key)]))
}
async function saveCatalog(formData: FormData, update: boolean) {
  const session = await guardAdmin()
  if (!session.user?.id) throw new Error('Unauthorized')
  const id = formData.get('id')
  if (update && (typeof id !== 'string' || !id)) return { error: 'Select a program to edit.' }
  try {
    await writeProgramCatalog(session.user.id, programForm(formData), update && typeof id === 'string' ? id : undefined)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 400) return { error: invalidProgram }
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'P2002') return { error: duplicateSlug }
      if (error.code === 'P2025') return { error: 'This program is no longer available. Reload the page.' }
    }
    throw error
  }
  revalidatePath('/admin/programs'); revalidatePath('/programs')
  return {}
}
async function createProgram(formData: FormData) { 'use server'; return saveCatalog(formData, false) }
async function updateProgram(formData: FormData) { 'use server'; return saveCatalog(formData, true) }
async function toggleProgram(formData: FormData) {
  'use server'
  const session = await guardAdmin()
  if (!session.user?.id) throw new Error('Unauthorized')
  await archiveProgramCatalog(session.user.id, String(formData.get('id')), String(formData.get('isActive')) === 'true')
  revalidatePath('/admin/programs'); revalidatePath('/programs')
}
async function deleteProgram(formData: FormData) {
  'use server'
  const session = await guardAdmin()
  if (!session.user?.id) throw new Error('Unauthorized')
  await archiveProgramCatalog(session.user.id, String(formData.get('id')))
  revalidatePath('/admin/programs'); revalidatePath('/programs')
}

export default async function AdminProgramsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const query = searchParams ? await searchParams : {}
  await guardAdmin()

  const programs = await prisma.program.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { enrollments: true } } },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Programs</h1>
      <Button asChild variant="outline"><Link href="/admin/program-enrollments">Manage enrollments and sessions</Link></Button>
      {query.error && <p role="alert" className="text-destructive">{query.error === 'duplicate-slug' ? duplicateSlug : invalidProgram}</p>}
      <p className="text-sm text-muted-foreground">Deleting a program with enrollments archives its catalog listing and preserves customer access.</p>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-medium mb-3">Create Program</h2>
          <CatalogEditor action={createProgram} item="Program" create>
            <div className="grid gap-1">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" name="title" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-slug">Slug</Label>
              <Input id="new-slug" name="slug" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-price">Price (paise)</Label>
              <Input id="new-price" name="pricePaise" type="number" min="1" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-total">Total Sessions</Label>
              <Input id="new-total" name="totalSessions" type="number" min="1" defaultValue="8" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-perweek">Sessions/Week</Label>
              <Input id="new-perweek" name="sessionsPerWeek" type="number" min="1" defaultValue="2" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-dur">Duration (min)</Label>
              <Input id="new-dur" name="durationMinutes" type="number" min="1" defaultValue="60" required />
            </div>
            <div className="md:col-span-3 grid gap-1">
              <Label htmlFor="new-desc">Description</Label>
              <textarea id="new-desc" name="description" required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
            </div>
          </CatalogEditor>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y">
          {programs.map((p) => (
            <article key={p.id} aria-label={`Program ${p.title}`} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">
                    {p.title}
                    {!p.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    /{p.slug} · ₹{(p.pricePaise / 100).toFixed(2)} · {p.totalSessions} sessions ({p.sessionsPerWeek}/wk, {p.durationMinutes}min) · {p._count.enrollments} enrolled
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <form action={toggleProgram}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="isActive" value={String(p.isActive)} />
                    <Button type="submit" variant="outline" size="sm">
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </form>
                  <form action={deleteProgram}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="destructive" size="sm">{p._count.enrollments > 0 ? 'Archive' : 'Delete'}</Button>
                  </form>
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                <CatalogEditor action={updateProgram} item="Program">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="grid gap-1">
                    <Label htmlFor={`${p.id}-title`}>Title</Label>
                    <Input id={`${p.id}-title`} name="title" defaultValue={p.title} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${p.id}-price`}>Price (paise)</Label>
                    <Input id={`${p.id}-price`} name="pricePaise" type="number" min="1" defaultValue={p.pricePaise} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${p.id}-total`}>Total Sessions</Label>
                    <Input id={`${p.id}-total`} name="totalSessions" type="number" min="1" defaultValue={p.totalSessions} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${p.id}-perweek`}>Sessions/Week</Label>
                    <Input id={`${p.id}-perweek`} name="sessionsPerWeek" type="number" min="1" defaultValue={p.sessionsPerWeek} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${p.id}-duration`}>Duration (min)</Label>
                    <Input id={`${p.id}-duration`} name="durationMinutes" type="number" min="1" defaultValue={p.durationMinutes} required />
                  </div>
                  <div className="md:col-span-3 grid gap-1">
                    <Label htmlFor={`${p.id}-description`}>Description</Label>
                    <textarea id={`${p.id}-description`} name="description" defaultValue={p.description} required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                  </div>
                </CatalogEditor>
              </details>
            </article>
          ))}
          {programs.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No programs yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
