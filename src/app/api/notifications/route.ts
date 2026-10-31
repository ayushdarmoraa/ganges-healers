import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { listNotifications, markAllNotificationsRead, NotificationError, notificationQuerySchema } from '@/lib/notifications/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    }

    const parsed = notificationQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid notification filters' }, { status: 400, headers })
    return NextResponse.json(await listNotifications(session.user.id, parsed.data), { headers })
  } catch (err) {
    if (err instanceof NotificationError) return NextResponse.json({ error: err.message }, { status: err.status, headers })
    console.error('[notifications][list][error]', { type: err instanceof Error ? err.name : 'unknown' })
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500, headers })
  }
}

const bulkSchema = z.object({ action: z.literal('readAll'), ownerId: z.string().min(1).max(200) }).strict()

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const parsed = bulkSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'A valid read-all action and current account are required' }, { status: 400, headers })
    if (parsed.data.ownerId !== session.user.id) return NextResponse.json({ error: 'Your account changed. Refresh before trying again.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    return NextResponse.json(await markAllNotificationsRead(session.user.id), { headers })
  } catch (err) {
    console.error('[notifications][read-all][error]', { type: err instanceof Error ? err.name : 'unknown' })
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500, headers })
  }
}
