import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import AudioManager from '@/components/audio/AudioManager'

export default async function AdminAudioPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  try { await requireCurrentAdmin() } catch { redirect('/') }
  return <AudioManager />
}
