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

async function updateHealer(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = String(formData.get('id'))
  const bio = String(formData.get('bio') || '') || null
  const experienceYears = parseInt(String(formData.get('experienceYears') || '0'), 10)
  const specializations = String(formData.get('specializations') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await prisma.healer.update({
    where: { id },
    data: { bio, experienceYears, specializations },
  })
  revalidatePath('/admin/healers')
}

async function toggleHealer(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = String(formData.get('id'))
  const current = String(formData.get('isActive')) === 'true'
  await prisma.healer.update({ where: { id }, data: { isActive: !current } })
  revalidatePath('/admin/healers')
}

async function toggleVerified(formData: FormData) {
  'use server'
  await guardAdmin()
  const id = String(formData.get('id'))
  const current = String(formData.get('isVerified')) === 'true'
  await prisma.healer.update({ where: { id }, data: { isVerified: !current } })
  revalidatePath('/admin/healers')
}


export default async function AdminHealersPage() {
  await guardAdmin()

  const healers = await prisma.healer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { bookings: true } },
    },
  })

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · Healers</h1>
      <p className="text-sm text-muted-foreground">Deactivate a healer to stop new bookings. Existing appointments, program assignments and the user account are kept.</p>

      <Card>
        <CardContent className="p-0 divide-y">
          {healers.map((h) => (
            <article key={h.id} aria-label={`Healer ${h.user.name || h.user.email}`} className="p-4 space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium">
                    {h.user.name || h.user.email}
                    {!h.isActive && <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>}
                    {h.isVerified && <span className="ml-2 text-xs text-green-600">✓ Verified</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {h.user.email} · {h.experienceYears}yr exp · Rating: {h.rating.toFixed(1)} · {h._count.bookings} bookings
                  </div>
                  {h.specializations.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Specializations: {h.specializations.join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  <form action={toggleHealer}>
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="isActive" value={String(h.isActive)} />
                    <Button type="submit" variant="outline" size="sm">
                      {h.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </form>
                  <form action={toggleVerified}>
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="isVerified" value={String(h.isVerified)} />
                    <Button type="submit" variant="outline" size="sm">
                      {h.isVerified ? 'Unverify' : 'Verify'}
                    </Button>
                  </form>

                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-primary">Edit</summary>
                <form action={updateHealer} className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="hidden" name="id" value={h.id} />
                  <div className="grid gap-1">
                    <Label>Experience (years)</Label>
                    <Input name="experienceYears" type="number" min="0" defaultValue={h.experienceYears} />
                  </div>
                  <div className="grid gap-1">
                    <Label>Specializations (comma-separated)</Label>
                    <Input name="specializations" defaultValue={h.specializations.join(', ')} />
                  </div>
                  <div className="md:col-span-3 grid gap-1">
                    <Label>Bio</Label>
                    <textarea name="bio" defaultValue={h.bio ?? ''} className="min-h-[60px] rounded-md border px-3 py-2 bg-background text-sm" />
                  </div>
                  <div>
                    <Button type="submit" size="sm">Save</Button>
                  </div>
                </form>
              </details>
            </article>
          ))}
          {healers.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No healers registered yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
