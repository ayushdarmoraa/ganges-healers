/**
 * Backfill script: fills source and experimentVariant for old FunnelEvent rows
 * that have NULL values in those columns (added after data collection started).
 *
 * Usage:  npx tsx scripts/backfill-events.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Backfill source → 'direct' for rows where source IS NULL
  const sourceResult = await prisma.funnelEvent.updateMany({
    where: { source: null },
    data: { source: 'direct' },
  })
  console.log(`[backfill] source: ${sourceResult.count} rows → 'direct'`)

  // Backfill experimentVariant → 'unknown' for rows where experimentVariant IS NULL
  const variantResult = await prisma.funnelEvent.updateMany({
    where: { experimentVariant: null },
    data: { experimentVariant: 'unknown' },
  })
  console.log(`[backfill] experimentVariant: ${variantResult.count} rows → 'unknown'`)

  // Backfill Order.source → 'direct' for old orders
  const orderSourceResult = await prisma.order.updateMany({
    where: { source: null },
    data: { source: 'direct' },
  })
  console.log(`[backfill] Order.source: ${orderSourceResult.count} rows → 'direct'`)

  // Backfill Order.experimentVariant → 'unknown' for old orders
  const orderVariantResult = await prisma.order.updateMany({
    where: { experimentVariant: null },
    data: { experimentVariant: 'unknown' },
  })
  console.log(`[backfill] Order.experimentVariant: ${orderVariantResult.count} rows → 'unknown'`)

  console.log('[backfill] Done.')
}

main()
  .catch((err) => {
    console.error('[backfill] Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
