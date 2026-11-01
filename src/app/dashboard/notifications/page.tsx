import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import NotificationInbox from '@/components/notifications/NotificationInbox'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notifications | Ganges Healers' }

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=%2Fdashboard%2Fnotifications')
  return <NotificationInbox />
}
