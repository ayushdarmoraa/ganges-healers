import type { Prisma } from '@prisma/client'

const namespaces = { payment: 72101, healer: 72102, program: 72103, community: 72104, membership: 72105, course: 72106, account: 72108, audio: 72109 } as const

/** Serialize related writes on this transaction's connection; release on commit/rollback. */
export async function lockTransaction(tx: Prisma.TransactionClient, namespace: keyof typeof namespaces, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespaces[namespace]}::int, hashtext(${key}::text))`
}
