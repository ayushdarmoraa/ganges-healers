import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCommunityTags } from '@/lib/community/tags'

// GET /api/community/tags — list all tags (auth required)
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tags = await getCommunityTags()

    return NextResponse.json({ success: true, data: tags })
  } catch (error) {
    console.error('Community tags GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
