import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const notificationQuerySchema = z.object({
  status: z.enum(['all', 'unread', 'read']).default('all'),
  type: z.enum(['all', 'community_comment', 'community_like', 'other']).default('all'),
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().min(1).max(200).optional(),
})

export class NotificationError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'NotificationError' }
}

/** All filters and cursor lookups stay inside the authenticated account. */
export async function listNotifications(userId: string, query: z.infer<typeof notificationQuerySchema>) {
  if (query.cursor && !await prisma.notification.findFirst({ where: { id: query.cursor, userId }, select: { id: true } })) throw new NotificationError('Notification cursor not found', 404)
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.status !== 'all' ? { read: query.status === 'read' } : {}),
    ...(query.type === 'other' ? { type: { notIn: ['community_comment', 'community_like'] } } : query.type !== 'all' ? { type: query.type } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { message: { contains: query.q, mode: 'insensitive' } }] } : {}),
  }
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }),
    prisma.notification.count({ where: { userId, read: false } }),
  ])
  const hasMore = rows.length > query.limit
  if (hasMore) rows.pop()
  return { ownerId: userId, notifications: rows, unreadCount, nextCursor: hasMore ? rows.at(-1)?.id || null : null }
}

/** One scoped update avoids the old find-then-write ownership window. */
export async function setNotificationRead(userId: string, id: string, read: boolean) {
  const changed = await prisma.notification.updateMany({ where: { id, userId }, data: { read } })
  if (!changed.count) throw new NotificationError('Notification not found', 404)
  return { ok: true, ownerId: userId, unreadCount: await prisma.notification.count({ where: { userId, read: false } }) }
}

/** The statement marks current owned rows; later arrivals remain unread. */
export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
  return { ok: true, ownerId: userId, updated: result.count, unreadCount: await prisma.notification.count({ where: { userId, read: false } }) }
}
