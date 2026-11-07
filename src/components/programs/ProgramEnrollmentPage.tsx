import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { listProgramEnrollments, programActor, ProgramAccessError, type ProgramScope } from '@/lib/programs/enrollments'
import { authPathWithCallback } from '@/lib/auth/callback-url'
import { Button } from '@/components/ui/button'
import ProgramWorkspace from './ProgramWorkspace'

export default async function ProgramEnrollmentPage({ scope, searchParams }: { scope: ProgramScope; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const path = scope === 'admin' ? '/admin/program-enrollments' : scope === 'healer' ? '/healer/programs' : '/dashboard/programs'
  const actor = await programActor().catch(error => {
    if (error instanceof ProgramAccessError && error.status === 401) redirect(authPathWithCallback('/auth/signin', path))
    throw error
  })
  if (scope === 'admin' && actor.role !== 'ADMIN' || scope === 'healer' && !actor.healerId) redirect('/dashboard')
  const params = await searchParams
  const parsed = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1000 ? parsed : 1
  const healerQuery = typeof params.healerQuery === 'string' ? params.healerQuery.trim().slice(0, 100) : ''
  const [data, healers] = await Promise.all([
    listProgramEnrollments(actor, scope, page),
    scope === 'admin' ? prisma.healer.findMany({ where: { isActive: true, user: { role: 'HEALER' }, ...(healerQuery ? { OR: [{ id: healerQuery }, { user: { name: { contains: healerQuery, mode: 'insensitive' } } }] } : {}) }, take: 50, orderBy: { id: 'asc' }, select: { id: true, user: { select: { name: true } } } }) : Promise.resolve([]),
  ])
  function pageHref(value: number) { return `${path}?${new URLSearchParams({ page: String(value), ...(healerQuery ? { healerQuery } : {}) })}` }
  return <div className="container mx-auto px-4 py-8 space-y-6"><h1 className="text-2xl font-semibold">{scope === 'mine' ? 'My Programs' : scope === 'admin' ? 'Program Enrollments' : 'Assigned Programs'}</h1>
    {scope === 'admin' && <form className="flex flex-wrap items-end gap-3" method="get"><label className="grid gap-1 text-sm">Find practitioner by name or ID<input name="healerQuery" defaultValue={healerQuery} className="h-10 rounded-md border bg-background px-3" maxLength={100} /></label><Button variant="outline" type="submit">Search practitioners</Button><span className="text-sm text-muted-foreground">Showing up to 50 active practitioners; search to narrow the choices.</span></form>}
    <ProgramWorkspace items={data.items} healers={healers.map(healer => ({ id: healer.id, name: healer.user.name || 'Healer' }))} />
    <nav aria-label="Program enrollment pages" className="flex justify-between gap-3">{page > 1 ? <Link className="underline" href={pageHref(page - 1)}>Previous programs</Link> : <span />}{data.hasNextPage && <Link className="underline" href={pageHref(page + 1)}>Next programs</Link>}</nav>
  </div>
}
