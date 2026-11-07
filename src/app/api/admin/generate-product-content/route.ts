import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { AIContentNotConfiguredError, generateProductContent } from '@/lib/ai/generate-product-content'
import { z } from 'zod'

const inputSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  chakra: z.string().min(1).max(50),
  material: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
})

export async function POST(request: Request) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const content = await generateProductContent(parsed.data)
    return NextResponse.json(content)
  } catch (err) {
    if (err instanceof AIContentNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    // SDK error messages can contain key fragments or submitted content.
    console.error('[AI Generate Product Content]', { type: err instanceof Error ? err.name : 'UnknownError' })
    return NextResponse.json(
      { error: 'Failed to generate content. Please check your OpenAI API key and try again.' },
      { status: 500 },
    )
  }
}
