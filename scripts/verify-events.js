// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS CLI; preserve node scripts/verify-events.js usage.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='FunnelEvent' ORDER BY ordinal_position"
  )
  console.log('FunnelEvent columns:')
  console.table(cols)

  const count = await p.funnelEvent.count()
  console.log('Total FunnelEvent rows:', count)

  // Check latest events
  const latest = await p.funnelEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  console.log('Latest events:', JSON.stringify(latest, null, 2))
}

main().catch(console.error).finally(() => p.$disconnect())
