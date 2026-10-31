import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { CommunityModerationError, submitCommunityReport } from '@/lib/community/moderation'

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string().min(1),
  reason: z.string().trim().min(5).max(500),
})

// Preserve the response contract while recording the report and audit atomically.
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed = reportSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const report = await submitCommunityReport({ actorId: session.user.id, ...parsed.data })
    return NextResponse.json({ success: true, data: { id: report.id } }, { status: 201 })
  } catch (error) {
    if (error instanceof CommunityModerationError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Community report POST error:', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
