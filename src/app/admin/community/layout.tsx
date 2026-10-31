import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCommunityAdmin } from '@/lib/community/admin'

export const dynamic = 'force-dynamic'

/** The moderation and catalog screens share one server authorization boundary. */
export default async function CommunityAdminLayout({ children }: { children: ReactNode }) {
  try { await requireCommunityAdmin() } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (status === 401 || status === 403) {
      const session = await auth()
      redirect(session?.user?.id ? '/dashboard' : '/auth/signin')
    }
    throw error
  }
  return children
}
