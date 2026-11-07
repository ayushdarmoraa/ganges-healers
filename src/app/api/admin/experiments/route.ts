import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { createExperiment } from '@/lib/experiments/create-experiment'

/**
 * POST /api/admin/experiments
 *
 * Body: { key: string, variants?: { name: string, weight: number }[] }
 *
 * Creates or reactivates an experiment with DB-backed variant weights.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const key = typeof body.key === 'string' ? body.key.trim() : ''

    if (!key || key.length > 64) {
      return NextResponse.json(
        { error: 'key is required (max 64 chars)' },
        { status: 400 },
      )
    }

    // Validate variants if provided
    const variants: { name: string; weight: number }[] | undefined = body.variants
    if (variants) {
      if (!Array.isArray(variants) || variants.length < 2) {
        return NextResponse.json(
          { error: 'variants must be an array of at least 2 items' },
          { status: 400 },
        )
      }
      for (const v of variants) {
        if (typeof v.name !== 'string' || !v.name.trim()) {
          return NextResponse.json({ error: 'Each variant needs a name' }, { status: 400 })
        }
        if (typeof v.weight !== 'number' || v.weight < 1) {
          return NextResponse.json({ error: 'Each variant needs a weight >= 1' }, { status: 400 })
        }
      }
    }

    const result = await createExperiment({ key, variants })

    return NextResponse.json(result, { status: result.isNew ? 201 : 200 })
  } catch (err) {
    console.error('[experiments] Error creating experiment:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
