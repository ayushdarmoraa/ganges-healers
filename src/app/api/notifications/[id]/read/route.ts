import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { NotificationError, setNotificationRead } from '@/lib/notifications/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const readSchema = z.object({ read: z.boolean().default(true), ownerId: z.string().min(1).max(200).optional() }).strict()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    }

    const { id } = await params

    const source = await request.text()
    let body: unknown = {}
    try { body = source ? JSON.parse(source) : {} } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }) }
    const parsed = readSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'A boolean read state is required' }, { status: 400, headers })
    if (parsed.data.ownerId && parsed.data.ownerId !== session.user.id) return NextResponse.json({ error: 'Your account changed. Refresh before trying again.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    return NextResponse.json(await setNotificationRead(session.user.id, id, parsed.data.read), { headers })
  } catch (err) {
    if (err instanceof NotificationError) return NextResponse.json({ error: err.message }, { status: err.status, headers })
    console.error('[notifications][read][error]', { type: err instanceof Error ? err.name : 'unknown' })
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500, headers })
  }
}
