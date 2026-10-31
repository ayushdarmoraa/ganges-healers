import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCommunityAdmin } from '@/lib/community/admin'
import CommunityModeration from '@/components/community/CommunityModeration'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Community Moderation | Ganges Healers' }

export default async function AdminCommunityPage() {
  try { await requireCommunityAdmin() } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (status === 401 || status === 403) {
      const session = await auth()
      redirect(session?.user?.id ? '/dashboard' : '/auth/signin')
    }
    throw error
  }
  return <CommunityModeration />
}
