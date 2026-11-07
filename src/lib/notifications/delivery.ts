import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { enqueueNotification, type NotificationJobData } from '@/lib/queues/jobs'
import { emitNotification } from '@/lib/socket'

/** Retryable queue jobs reuse their producer's ID without resetting an existing read state. */
export async function storeNotification(data: NotificationJobData, db: Pick<PrismaClient, 'notification'> = prisma) {
  const fields = { userId: data.userId, type: data.type, title: data.title, message: data.message }
  const row = data.notificationId
    ? await db.notification.upsert({ where: { id: data.notificationId }, create: { id: data.notificationId, ...fields }, update: {} })
    : await db.notification.create({ data: fields })
  if (row.userId !== data.userId || row.type !== data.type || row.title !== data.title || row.message !== data.message) throw new Error('Notification identity conflict')
  try {
    emitNotification(row.userId, { id: row.id, type: row.type, title: row.title, message: row.message, createdAt: row.createdAt.toISOString() })
  } catch (error) {
    console.warn('[notifications][emit][error]', { id: row.id, type: error instanceof Error ? error.name : 'unknown' })
  }
  return row
}

/** A confirmed unavailable queue falls back to persistence; uncertain enqueue errors do not double-send. */
export async function deliverNotification(data: NotificationJobData) {
  const input = { ...data, notificationId: data.notificationId || randomUUID() }
  if (await enqueueNotification(input)) return { queued: true }
  const row = await storeNotification(input)
  return { queued: false, id: row.id }
}
