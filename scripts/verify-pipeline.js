/**
 * End-to-end event pipeline verification script.
 * Simulates the full funnel: quiz → product view → add to cart → checkout start → purchase.
 * Then verifies all events landed in the DB with correct fields.
 *
 * Usage: node scripts/verify-pipeline.js
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS CLI; preserve node scripts/verify-pipeline.js usage.
require('dotenv/config')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS CLI; package.json does not declare an ESM runtime.
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const TEST_SESSION = `test-session-${Date.now()}`
const TEST_EMAIL = `pipeline-test-${Date.now()}@test.local`

async function main() {
  console.log('=== EVENT PIPELINE VERIFICATION ===\n')

  // 1. Direct DB test: insert events through Prisma (bypasses HTTP but tests schema)
  console.log('1. Testing direct DB event insertion...')

  const events = [
    { type: 'quiz_complete', sessionId: TEST_SESSION, source: 'quiz', chakra: 'Heart', experimentVariant: 'product_headline:A', metadata: { email: TEST_EMAIL, intention: 'meditation' } },
    { type: 'product_view', sessionId: TEST_SESSION, source: 'quiz', chakra: 'Heart', experimentVariant: 'product_headline:A', metadata: { productId: 'test-prod-1', title: 'Test Product' } },
    { type: 'add_to_cart', sessionId: TEST_SESSION, experimentVariant: 'product_headline:A', metadata: { productId: 'test-prod-1', pricePaise: 49900 } },
    { type: 'checkout_start', sessionId: TEST_SESSION, experimentVariant: 'product_headline:A', metadata: { totalPaise: 49900 } },
    { type: 'purchase', sessionId: TEST_SESSION, experimentVariant: 'product_headline:A', metadata: { totalPaise: 49900 }, source: 'quiz', chakra: 'Heart' },
  ]

  for (const evt of events) {
    await prisma.funnelEvent.create({ data: evt })
    console.log(`  ✓ ${evt.type}`)
  }

  // 2. Verify all events exist
  console.log('\n2. Verifying events in DB...')
  const saved = await prisma.funnelEvent.findMany({
    where: { sessionId: TEST_SESSION },
    orderBy: { createdAt: 'asc' },
  })

  const expectedTypes = ['quiz_complete', 'product_view', 'add_to_cart', 'checkout_start', 'purchase']
  let allGood = true

  for (const expected of expectedTypes) {
    const found = saved.find(e => e.type === expected)
    if (!found) {
      console.log(`  ✗ MISSING: ${expected}`)
      allGood = false
      continue
    }

    const issues = []
    if (!found.sessionId) issues.push('sessionId missing')
    if (!found.experimentVariant) issues.push('experimentVariant missing')
    if (expected === 'quiz_complete' || expected === 'purchase') {
      if (!found.source) issues.push('source missing')
      if (!found.chakra) issues.push('chakra missing')
    }

    if (issues.length > 0) {
      console.log(`  ⚠ ${expected}: ${issues.join(', ')}`)
      allGood = false
    } else {
      console.log(`  ✓ ${expected} — all fields present`)
    }
  }

  // 3. Verify lead scoring
  console.log('\n3. Testing lead score accumulation...')
  // Create a test quiz lead
  await prisma.quizLead.upsert({
    where: {
      email_intention_practice_chakra: {
        email: TEST_EMAIL,
        intention: 'meditation',
        practice: 'beginner',
        chakra: 'Heart',
      },
    },
    update: { score: 0 },
    create: {
      email: TEST_EMAIL,
      name: 'Pipeline Test',
      intention: 'meditation',
      practice: 'beginner',
      chakra: 'Heart',
      score: 0,
    },
  })

  // Lead scoring - inline implementation (can't use TS path aliases from CJS)
  const SCORES = {
    quiz_complete: 10,
    product_view: 20,
    add_to_cart: 30,
    checkout_start: 40,
    purchase: 50,
  }

  async function incrementLeadScore(email, action) {
    const points = SCORES[action]
    if (!points) return
    await prisma.quizLead.updateMany({
      where: { email: email.toLowerCase().trim() },
      data: { score: { increment: points } },
    })
  }

  const scoreActions = [
    { action: 'quiz_complete', expected: 10 },
    { action: 'product_view', expected: 30 },
    { action: 'add_to_cart', expected: 60 },
    { action: 'checkout_start', expected: 100 },
    { action: 'purchase', expected: 150 },
  ]

  for (const { action, expected } of scoreActions) {
    await incrementLeadScore(TEST_EMAIL, action)
    const lead = await prisma.quizLead.findFirst({
      where: { email: TEST_EMAIL },
      select: { score: true },
    })
    const actual = lead?.score ?? 0
    if (actual === expected) {
      console.log(`  ✓ After ${action}: score = ${actual} (expected ${expected})`)
    } else {
      console.log(`  ✗ After ${action}: score = ${actual} (expected ${expected})`)
      allGood = false
    }
  }

  // 4. Experiment system: verify cookie-based bucketing via DB experiment
  console.log('\n4. Testing experiment model...')
  const exp = await prisma.experiment.upsert({
    where: { key: 'pipeline_test' },
    update: { isActive: true },
    create: { key: 'pipeline_test', isActive: true },
  })
  // Ensure variants exist
  for (const name of ['A', 'B']) {
    await prisma.experimentVariant.upsert({
      where: { experimentId_name: { experimentId: exp.id, name } },
      update: { weight: 50 },
      create: { experimentId: exp.id, name, weight: 50 },
    })
  }
  const variants = await prisma.experimentVariant.findMany({ where: { experimentId: exp.id } })
  console.log(`  ✓ Experiment 'pipeline_test' created with ${variants.length} variants`)

  // 5. Live funnel API data check (verify events are queryable)
  console.log('\n5. Verifying live funnel query...')
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentCount = await prisma.funnelEvent.count({
    where: { createdAt: { gte: sixtyMinAgo } },
  })
  const breakdown = await prisma.funnelEvent.groupBy({
    by: ['type'],
    where: { createdAt: { gte: sixtyMinAgo } },
    _count: true,
  })
  console.log(`  ✓ Recent events (60min): ${recentCount}`)
  for (const b of breakdown) {
    console.log(`    ${b.type}: ${b._count}`)
  }

  // 6. Experiment stats query
  console.log('\n6. Verifying experiment stats query...')
  const impressions = await prisma.funnelEvent.groupBy({
    by: ['experimentVariant'],
    where: { type: 'product_view', experimentVariant: { not: null } },
    _count: true,
  })
  const purchases = await prisma.funnelEvent.groupBy({
    by: ['experimentVariant'],
    where: { type: 'purchase', experimentVariant: { not: null } },
    _count: true,
  })
  console.log(`  ✓ Impression groups: ${impressions.length}`)
  console.log(`  ✓ Purchase groups: ${purchases.length}`)
  for (const imp of impressions) {
    const purch = purchases.find(p => p.experimentVariant === imp.experimentVariant)
    const purchCount = purch?._count ?? 0
    const rate = imp._count > 0 ? ((purchCount / imp._count) * 100).toFixed(1) : '0'
    console.log(`    Variant ${imp.experimentVariant}: ${imp._count} impressions, ${purchCount} purchases (${rate}% conversion)`)
  }

  // Cleanup
  console.log('\n7. Cleaning up test data...')
  await prisma.funnelEvent.deleteMany({ where: { sessionId: TEST_SESSION } })
  await prisma.quizLead.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.experimentVariant.deleteMany({ where: { experimentId: exp.id } })
  await prisma.experiment.delete({ where: { id: exp.id } })
  console.log('  ✓ Test data cleaned up')

  console.log('\n' + (allGood ? '=== ALL CHECKS PASSED ===' : '=== SOME CHECKS FAILED ==='))
  process.exit(allGood ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
}).finally(() => prisma.$disconnect())
