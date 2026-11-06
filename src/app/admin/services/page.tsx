import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Prisma } from '@prisma/client'
import { CatalogEditor } from '@/components/admin/catalog-editor'
import { maxServiceDuration, maxServicePrice, serviceFieldsSchema, serviceFormSchema } from '@/lib/services/catalog-schema'

const invalidFields = 'Enter a name, description and category, choose a mode, and enter a valid price and duration.'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  return session
}

async function createService(formData: FormData) {
  'use server'
  await guardAdmin()
  const fields = serviceFormSchema.safeParse(Object.fromEntries(formData))
  if (!fields.success) {
    const invalidSlug = fields.error.issues.some(issue => issue.path[0] === 'slug')
    return { error: invalidSlug ? 'Use lowercase letters, numbers and single hyphens for the URL slug.' : invalidFields }
  }
  try {
    await prisma.service.create({ data: fields.data })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'That URL slug is already in use. Choose another.' }
    }
    throw error
  }
  revalidatePath('/admin/services')
  return {}
}

async function updateService(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = formData.get('id')
  const fields = serviceFieldsSchema.safeParse(Object.fromEntries(formData))
  if (!fields.success) return { error: invalidFields }
  if (typeof id !== 'string' || !id) return { error: 'Select a service to edit.' }
  const result = await prisma.service.updateMany({ where: { id }, data: fields.data })
  if (!result.count) return { error: 'This service is no longer available. Reload the page.' }
  revalidatePath('/admin/services')
  return {}
}

async function toggleService(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = String(formData.get('id'))
  const current = String(formData.get('isActive')) === 'true'
  await prisma.service.update({ where: { id }, data: { isActive: !current } })
  revalidatePath('/admin/services')
}


export default async function AdminServicesPage() {
  await guardAdmin()

  const services = await prisma.service.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { bookings: true } } },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Services</h1>
      <p className="text-sm text-muted-foreground">Deactivate a service to stop offering it. Existing bookings, payments and linked records are kept.</p>

      {/* Create form */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-medium mb-3">Create Service</h2>
          <CatalogEditor action={createService} item="Service" create>
            <div className="grid gap-1">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" name="name" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-slug">Slug</Label>
              <Input id="new-slug" name="slug" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-category">Category</Label>
              <Input id="new-category" name="category" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-price">Price (₹)</Label>
              <Input id="new-price" name="price" type="number" step="0.01" min="0" max={maxServicePrice} required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-duration">Duration (min)</Label>
              <Input id="new-duration" name="duration" type="number" min="1" max={maxServiceDuration} defaultValue="60" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-mode">Mode</Label>
              <select id="new-mode" name="mode" className="h-9 rounded-md border px-2 bg-background" defaultValue="BOTH">
                <option value="ONLINE">Online</option>
                <option value="OFFLINE">Offline</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <div className="md:col-span-3 grid gap-1">
              <Label htmlFor="new-desc">Description</Label>
              <textarea id="new-desc" name="description" required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
            </div>
          </CatalogEditor>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0 divide-y">
          {services.map((s) => (
            <article key={s.id} aria-label={`Service ${s.name}`} className="p-4 space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium">
                    {s.name}
                    {!s.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    /{s.slug} · {s.category} · ₹{s.price} · {s.duration}min · {s.mode} · {s._count.bookings} bookings
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <form action={toggleService}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="isActive" value={String(s.isActive)} />
                    <Button type="submit" variant="outline" size="sm">
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </form>

                </div>
              </div>
              {/* Inline edit */}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                <CatalogEditor action={updateService} item="Service">
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid gap-1">
                    <Label htmlFor={`${s.id}-name`}>Name</Label>
                    <Input id={`${s.id}-name`} name="name" defaultValue={s.name} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${s.id}-category`}>Category</Label>
                    <Input id={`${s.id}-category`} name="category" defaultValue={s.category} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${s.id}-price`}>Price (₹)</Label>
                    <Input id={`${s.id}-price`} name="price" type="number" step="0.01" min="0" max={maxServicePrice} defaultValue={s.price} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${s.id}-duration`}>Duration (min)</Label>
                    <Input id={`${s.id}-duration`} name="duration" type="number" min="1" max={maxServiceDuration} defaultValue={s.duration} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${s.id}-mode`}>Mode</Label>
                    <select id={`${s.id}-mode`} name="mode" className="h-9 rounded-md border px-2 bg-background" defaultValue={s.mode}>
                      <option value="ONLINE">Online</option>
                      <option value="OFFLINE">Offline</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </div>
                  <div className="md:col-span-3 grid gap-1">
                    <Label htmlFor={`${s.id}-description`}>Description</Label>
                    <textarea id={`${s.id}-description`} name="description" defaultValue={s.description} required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                  </div>
                </CatalogEditor>
              </details>
            </article>
          ))}
          {services.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No services yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
