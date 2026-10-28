/**
 * Stress test: simulates 10 concurrent funnel sessions.
 * Validates: no duplicates, all steps present, correct field population.
 *
 * Usage: node scripts/stress-test-events.js
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS CLI; preserve node scripts/stress-test-events.js usage.
require('dotenv/config')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS CLI; package.json does not declare an ESM runtime.
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const NUM_SESSIONS = 10
const SOURCES = ['quiz', 'whatsapp', 'direct', null]
const CHAKRAS = ['Root', 'Sacral', 'Solar Plexus', 'Heart', 'Throat', 'Third Eye', 'Crown']
const VARIANTS = ['product_headline:A', 'product_headline:B', 'pricing_test:A', 'pricing_test:B']

const FUNNEL_STEPS = ['quiz_start', 'quiz_complete', 'product_view', 'add_to_cart', 'checkout_start', 'purchase']

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

async function simulateSession(sessionIndex) {
  const sessionId = `stress-${Date.now()}-${sessionIndex}`
  const source = pick(SOURCES)
  const chakra = pick(CHAKRAS)
  const variant = pick(VARIANTS)
  const userId = Math.random() > 0.5 ? `user-stress-${sessionIndex}` : null

  const events = []
  for (const type of FUNNEL_STEPS) {
    events.push({
      type,
      sessionId,
      source,
      chakra: ['quiz_complete', 'product_view', 'purchase'].includes(type) ? chakra : null,
      experimentVariant: variant,
      userId,
      metadata: { sessionIndex, step: type, ts: Date.now() },
    })
  }

  // Insert with small random delays to simulate real traffic
  for (const evt of events) {
    await prisma.funnelEvent.create({ data: evt })
    await new Promise(r => setTimeout(r, Math.random() * 50))
  }

  return { sessionId, expectedCount: FUNNEL_STEPS.length, source, chakra, variant }
}

async function main() {
  console.log(`=== STRESS TEST: ${NUM_SESSIONS} concurrent sessions ===\n`)

  // Run all sessions concurrently
  const promises = Array.from({ length: NUM_SESSIONS }, (_, i) => simulateSession(i))
  const sessions = await Promise.all(promises)

  console.log(`✓ ${NUM_SESSIONS} sessions created (${NUM_SESSIONS * FUNNEL_STEPS.length} total events)\n`)

  // Validate
  let failures = 0

  for (const s of sessions) {
    const events = await prisma.funnelEvent.findMany({
      where: { sessionId: s.sessionId },
      orderBy: { createdAt: 'asc' },
    })

    // Check count
    if (events.length !== s.expectedCount) {
      console.log(`✗ Session ${s.sessionId}: expected ${s.expectedCount} events, got ${events.length}`)
      failures++
      continue
    }

    // Check all steps present
    const types = new Set(events.map(e => e.type))
    const missingSteps = FUNNEL_STEPS.filter(step => !types.has(step))
    if (missingSteps.length > 0) {
      console.log(`✗ Session ${s.sessionId}: missing steps: ${missingSteps.join(', ')}`)
      failures++
      continue
    }

    // Check no duplicates
    if (types.size !== events.length) {
      console.log(`✗ Session ${s.sessionId}: duplicate events detected`)
      failures++
      continue
    }

    // Check fields populated
    const fieldIssues = []
    for (const evt of events) {
      if (!evt.sessionId) fieldIssues.push(`${evt.type}: sessionId missing`)
      if (!evt.experimentVariant) fieldIssues.push(`${evt.type}: experimentVariant missing`)
    }
    if (fieldIssues.length > 0) {
      console.log(`✗ Session ${s.sessionId}: ${fieldIssues.join('; ')}`)
      failures++
      continue
    }

    console.log(`✓ Session ${s.sessionId}: ${events.length} events, all fields OK`)
  }

  // Global checks
  console.log('\n--- Global Validation ---')

  // Check total event count
  const allStressEvents = await prisma.funnelEvent.count({
    where: { sessionId: { startsWith: 'stress-' } },
  })
  console.log(`Total stress events in DB: ${allStressEvents}`)

  // Check experiment variant distribution
  const variantDist = await prisma.funnelEvent.groupBy({
    by: ['experimentVariant'],
    where: { sessionId: { startsWith: 'stress-' } },
    _count: true,
  })
  console.log('Variant distribution:')
  for (const v of variantDist) {
    console.log(`  ${v.experimentVariant}: ${v._count} events`)
  }

  // Check source distribution
  const sourceDist = await prisma.funnelEvent.groupBy({
    by: ['source'],
    where: { sessionId: { startsWith: 'stress-' } },
    _count: true,
  })
  console.log('Source distribution:')
  for (const s of sourceDist) {
    console.log(`  ${s.source || '(null)'}: ${s._count} events`)
  }

  // Cleanup
  console.log('\nCleaning up stress test data...')
  const deleted = await prisma.funnelEvent.deleteMany({
    where: { sessionId: { startsWith: 'stress-' } },
  })
  console.log(`✓ Deleted ${deleted.count} stress events`)

  console.log(`\n${failures === 0 ? '=== ALL SESSIONS PASSED ===' : `=== ${failures} SESSION(S) FAILED ===`}`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
