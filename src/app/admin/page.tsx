import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Server action for VIP + credits update
async function setVip(formData: FormData) {
  "use server"
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    throw new Error("Forbidden")
  }
  const userId = String(formData.get("userId"))
  const vip = String(formData.get("vip")) === "true"
  const credits = Number(formData.get("freeSessionCredits") || 0)

  await prisma.user.update({
    where: { id: userId },
    data: { vip, freeSessionCredits: credits },
  })
  revalidatePath("/admin")
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")
  if (session.user.role !== "ADMIN") redirect("/")

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      name: true,
      vip: true,
      freeSessionCredits: true,
      role: true,
      createdAt: true,
    },
  })
  type AdminUser = typeof users[number]

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">Admin · VIP Management</h1>

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

                <form action={setVip} className="flex items-end gap-4">
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="grid gap-1">
                    <Label htmlFor={`vip-${u.id}`}>VIP</Label>
                    <select
                      id={`vip-${u.id}`}
                      name="vip"
                      defaultValue={u.vip ? "true" : "false"}
                      className="h-9 rounded-md border px-2 bg-background"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <Label htmlFor={`credits-${u.id}`}>Free credits</Label>
                    <Input
                      id={`credits-${u.id}`}
                      name="freeSessionCredits"
                      type="number"
                      min={0}
                      defaultValue={u.freeSessionCredits ?? 0}
                      className="w-28"
                    />
                  </div>

                  <Button type="submit" size="sm">Save</Button>
                </form>
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
