import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

export default async function BlogAdminLayout({ children }: { children: ReactNode }) {
  try { await requireCurrentAdmin() } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (status === 401 || status === 403) {
      const session = await auth()
      redirect(session?.user?.id ? '/dashboard' : '/auth/signin')
    }
    throw error
  }
  return children
}
