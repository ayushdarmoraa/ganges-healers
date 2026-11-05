import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'

test('the additive reservation migration applies to an older schema without altering existing enrollment rows', async () => {
  const schema = `program_migration_${randomUUID().replace(/-/g, '')}`
  const migration = readFileSync('prisma/migrations/20261105200000_program_session_reservations/migration.sql', 'utf8')
  const rollback = new Error('rehearsal rollback')
  try {
    await prisma.$transaction(async tx => {
      // The integration harness has already pinned and verified its disposable test database.
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`)
      await tx.$executeRawUnsafe('CREATE TABLE "Healer" (id TEXT PRIMARY KEY)')
      await tx.$executeRawUnsafe('CREATE TABLE "ProgramEnrollment" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL)')
      await tx.$executeRawUnsafe('INSERT INTO "Healer" VALUES (\'legacy-practitioner\')')
      await tx.$executeRawUnsafe('INSERT INTO "ProgramEnrollment" VALUES (\'legacy-enrollment\', \'legacy-owner\')')
      for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
      const old = await tx.$queryRawUnsafe<Array<{ id: string; userId: string; assignedHealerId: string | null }>>('SELECT * FROM "ProgramEnrollment"')
      expect(old).toEqual([{ id: 'legacy-enrollment', userId: 'legacy-owner', assignedHealerId: null }])
      await tx.$executeRawUnsafe('INSERT INTO "ProgramSession" (id,"enrollmentId","healerId","sessionNumber","scheduledAt","durationMin","updatedAt") VALUES (\'reservation\',\'legacy-enrollment\',\'legacy-practitioner\',1,CURRENT_TIMESTAMP,60,CURRENT_TIMESTAMP)')
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>('SELECT status::text FROM "ProgramSession"')
      expect(rows).toEqual([{ status: 'SCHEDULED' }])
      const constraints = await tx.$queryRaw<Array<{ definition: string }>>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = ${schema})`
      expect(constraints.map(row => row.definition).join('\n')).toMatch(/FOREIGN KEY \("enrollmentId"\)/)
      expect(constraints.map(row => row.definition).join('\n')).toMatch(/CHECK.*durationMin/)
      throw rollback
    }, { timeout: 20000 })
  } catch (error) { if (error !== rollback) throw error }
  const after = await prisma.$queryRaw<Array<{ schema: string | null }>>`SELECT to_regnamespace(${schema})::text AS schema`
  expect(after[0].schema).toBeNull()
})
afterAll(async () => { await prisma.$disconnect() })
