import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCommunityTopics } from '@/lib/community/topics'

// GET /api/community/topics — list active topics (auth required)
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const topics = await getCommunityTopics()

    return NextResponse.json({ success: true, data: topics })
  } catch (error) {
    console.error('Community topics GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
