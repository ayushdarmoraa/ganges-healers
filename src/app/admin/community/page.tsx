import type { Metadata } from 'next'
import CommunityModeration from '@/components/community/CommunityModeration'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Community Moderation | Ganges Healers' }

export default function AdminCommunityPage() {
  return <CommunityModeration />
}
