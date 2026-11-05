import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/prisma'

test('the exact MFA migration preserves existing users and defaults to no enabled factor', async () => {
  const schema = `auth_migration_${randomUUID().replace(/-/g, '')}`
  const migration = readFileSync('prisma/migrations/20261105210000_authenticator_security/migration.sql', 'utf8')
  const rollback = new Error('rehearsal rollback')
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`)
      await tx.$executeRawUnsafe('CREATE TABLE "User" (id TEXT PRIMARY KEY, password TEXT NOT NULL)')
      await tx.$executeRawUnsafe('INSERT INTO "User" VALUES (\'legacy-owner\',\'existing-hash\')')
      for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
      expect(await tx.$queryRawUnsafe('SELECT * FROM "User"')).toEqual([{ id: 'legacy-owner', password: 'existing-hash', securityVersion: 0 }])
      expect(await tx.$queryRawUnsafe('SELECT * FROM "TwoFactorCredential"')).toEqual([])
      await tx.$executeRawUnsafe('INSERT INTO "TwoFactorCredential" ("userId","updatedAt") VALUES (\'legacy-owner\',CURRENT_TIMESTAMP)')
      const defaults = await tx.$queryRawUnsafe('SELECT enabled,"failedAttempts","recoveryHashes" FROM "TwoFactorCredential"')
      expect(defaults).toEqual([{ enabled: false, failedAttempts: 0, recoveryHashes: [] }])
      await tx.$executeRawUnsafe('DELETE FROM "User" WHERE id=\'legacy-owner\'')
      expect(await tx.$queryRawUnsafe('SELECT * FROM "TwoFactorCredential"')).toEqual([])
      const constraints = await tx.$queryRaw<Array<{ definition: string }>>`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = ${schema})`
      expect(constraints.map(row => row.definition).join('\n')).toMatch(/CHECK.*failedAttempts/)
      throw rollback
    }, { timeout: 20000 })
  } catch (error) { if (error !== rollback) throw error }
  const after = await prisma.$queryRaw<Array<{ schema: string | null }>>`SELECT to_regnamespace(${schema})::text AS schema`
  expect(after[0].schema).toBeNull()
})
afterAll(async () => { await prisma.$disconnect() })
