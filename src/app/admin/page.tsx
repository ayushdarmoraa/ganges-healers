import { redirect } from "next/navigation"
import Link from 'next/link'
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserBenefitsForm } from '@/components/admin/user-benefits-form'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { updateUserBenefits, UserBenefitsError, userBenefitsSelect, userBenefitsVersion, type UserBenefitsInput, type UserBenefitsResult } from '@/lib/admin/user-benefits'

// Server action for VIP + credits update
async function setVip(input: UserBenefitsInput): Promise<UserBenefitsResult> {
  "use server"
  try {
    const actor = await requireCurrentAdmin()
    const result = await updateUserBenefits(actor.id, input)
    revalidatePath('/admin')
    return { success: true, ...result }
  } catch (error) {
    if (error instanceof UserBenefitsError) return { success: false, error: error.message, code: error.code }
    if (error instanceof Error && 'status' in error && error.status === 403) return { success: false, error: 'Administrator access is required.', code: 'FORBIDDEN' }
    console.error('[admin][user-benefits][error]', { type: error instanceof Error ? error.name : 'unknown' })
    return { success: false, error: 'Benefits could not be saved. Reload and review the current values before trying again.', code: 'SAVE_FAILED' }
  }
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")
  if (session.user.role !== "ADMIN") redirect("/")

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { ...userBenefitsSelect, createdAt: true },
  })
  type AdminUser = typeof users[number]

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · VIP Management</h1>
      <p className="text-sm text-muted-foreground">Manage free-session balances and manual VIP access for accounts without subscription history. Subscription access follows its saved status and expiry. Add a reason when saving a change.</p>
      <nav className="flex flex-wrap gap-3" aria-label="Admin workspaces">
        <Button asChild variant="outline"><Link href="/admin/services">Manage Services</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/healers">Manage Healers</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/courses">Manage Courses</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audio">Manage Audio</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/products">Manage Products</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/orders">Manage Orders</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/programs">Manage Programs</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/program-enrollments">Program Enrollments</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/community">Community Moderation</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/blog">Manage Articles</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/payments">Payments</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
      </nav>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 divide-y">
            {users.map((u: AdminUser) => (
              <div key={u.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <div className="font-medium">{u.name ?? u.email}</div>
                  <div className="text-sm text-muted-foreground">
                    {u.email} · Role: {u.role} · Created: {new Date(u.createdAt).toLocaleString()}
                  </div>
                </div>

                <UserBenefitsForm actorId={session.user.id} label={u.name ? `${u.name} (${u.email})` : u.email} user={{ id: u.id, vip: u.vip, freeSessionCredits: u.freeSessionCredits, version: userBenefitsVersion(u) }} onSave={setVip} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Tip: To test the VIP path quickly, set yourself to VIP with 2 credits, then book from a service page.
      </p>
    </div>
  )
}
