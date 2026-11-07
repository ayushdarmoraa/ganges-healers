import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

test('the additive price migration preserves legacy rows with an unknown historical quote', async () => {
  const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations/20261029000000_enrollment_price_snapshots/migration.sql'), 'utf8')
  await prisma.$transaction(async tx => {
    // Temporary tables shadow the application tables only on this transaction's
    // connection, so the actual migration SQL can be tested without changing fixtures.
    await tx.$executeRaw`CREATE TEMP TABLE "ProgramEnrollment" (id text) ON COMMIT DROP`
    await tx.$executeRaw`CREATE TEMP TABLE "CourseEnrollment" (id text) ON COMMIT DROP`
    await tx.$executeRaw`INSERT INTO "ProgramEnrollment" (id) VALUES ('legacy-program')`
    await tx.$executeRaw`INSERT INTO "CourseEnrollment" (id) VALUES ('legacy-course')`
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(statement)
    }
    const programs = await tx.$queryRaw<Array<{ id: string; pricePaise: number | null }>>`SELECT id, "pricePaise" FROM "ProgramEnrollment"`
    const courses = await tx.$queryRaw<Array<{ id: string; pricePaise: number | null }>>`SELECT id, "pricePaise" FROM "CourseEnrollment"`
    expect(programs).toEqual([{ id: 'legacy-program', pricePaise: null }])
    expect(courses).toEqual([{ id: 'legacy-course', pricePaise: null }])
  })
})

afterAll(() => prisma.$disconnect())
