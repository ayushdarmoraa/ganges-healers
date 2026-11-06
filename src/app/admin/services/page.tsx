import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') redirect('/')
  return session
}

async function createService(formData: FormData) {
  'use server'
  await guardAdmin()
  const name = String(formData.get('name'))
  const slug = String(formData.get('slug'))
  const description = String(formData.get('description'))
  const category = String(formData.get('category'))
  const price = parseFloat(String(formData.get('price') || '0'))
  const duration = parseInt(String(formData.get('duration') || '60'), 10)
  const mode = String(formData.get('mode') || 'BOTH') as 'ONLINE' | 'OFFLINE' | 'BOTH'

  await prisma.service.create({
    data: { name, slug, description, category, price, duration, mode },
  })
  revalidatePath('/admin/services')
}

async function updateService(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = String(formData.get('id'))
  const name = String(formData.get('name'))
  const description = String(formData.get('description'))
  const category = String(formData.get('category'))
  const price = parseFloat(String(formData.get('price') || '0'))
  const duration = parseInt(String(formData.get('duration') || '60'), 10)
  const mode = String(formData.get('mode') || 'BOTH') as 'ONLINE' | 'OFFLINE' | 'BOTH'

  await prisma.service.update({
    where: { id },
    data: { name, description, category, price, duration, mode },
  })
  revalidatePath('/admin/services')
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
          <form action={createService} className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <Input id="new-price" name="price" type="number" step="0.01" min="0" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-duration">Duration (min)</Label>
              <Input id="new-duration" name="duration" type="number" min="1" defaultValue="60" required />
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
            <div>
              <Button type="submit" size="sm">Create</Button>
            </div>
          </form>
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
                <form action={updateService} className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid gap-1">
                    <Label>Name</Label>
                    <Input name="name" defaultValue={s.name} required />
                  </div>
                  <div className="grid gap-1">
                    <Label>Category</Label>
                    <Input name="category" defaultValue={s.category} required />
                  </div>
                  <div className="grid gap-1">
                    <Label>Price (₹)</Label>
                    <Input name="price" type="number" step="0.01" defaultValue={s.price} required />
                  </div>
                  <div className="grid gap-1">
                    <Label>Duration (min)</Label>
                    <Input name="duration" type="number" defaultValue={s.duration} required />
                  </div>
                  <div className="grid gap-1">
                    <Label>Mode</Label>
                    <select name="mode" className="h-9 rounded-md border px-2 bg-background" defaultValue={s.mode}>
                      <option value="ONLINE">Online</option>
                      <option value="OFFLINE">Offline</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </div>
                  <div className="md:col-span-3 grid gap-1">
                    <Label>Description</Label>
                    <textarea name="description" defaultValue={s.description} required className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                  </div>
                  <div>
                    <Button type="submit" size="sm">Save</Button>
                  </div>
                </form>
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
