import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL

/** Parse Redis URL into connection options for BullMQ */
function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      maxRetriesPerRequest: null as null,
    }
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null }
  }
}

// ─── Lazy queue singletons (only connect when REDIS_URL is set) ─

let _emailQueue: Queue | null = null
let _notificationQueue: Queue | null = null
let _activityQueue: Queue | null = null

function getRedisOpts() {
  if (!REDIS_URL) return null
  return parseRedisUrl(REDIS_URL)
}

/** Email queue — booking confirmations, cancellations, reminders, invoices */
export function getEmailQueue(): Queue | null {
  if (!_emailQueue) {
    const opts = getRedisOpts()
    if (!opts) return null
    _emailQueue = new Queue('email', {
      connection: opts,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })
  }
  return _emailQueue
}

/** Notification queue — create and push notifications to users */
export function getNotificationQueue(): Queue | null {
  if (!_notificationQueue) {
    const opts = getRedisOpts()
    if (!opts) return null
    _notificationQueue = new Queue('notification', {
      connection: opts,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })
  }
  return _notificationQueue
}

/** Activity log queue — async activity logging */
export function getActivityQueue(): Queue | null {
  if (!_activityQueue) {
    const opts = getRedisOpts()
    if (!opts) return null
    _activityQueue = new Queue('activity', {
      connection: opts,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    })
  }
  return _activityQueue
}

// ─── Job type definitions ───────────────────────────────────────

export type EmailJobData =
  | { type: 'booking_confirmation'; payload: { to: string; userName: string; serviceName: string; healerName: string; date: string; time: string; bookingId: string } }
  | { type: 'booking_cancellation'; payload: { to: string; userName: string; serviceName: string; date: string; time: string } }
  | { type: 'booking_reminder'; payload: { to: string; userName: string; serviceName: string; healerName: string; date: string; time: string; bookingId: string } }
  | { type: 'invoice'; payload: { to: string; invoiceNumber: string; amountPaise: number; link: string } }

export interface NotificationJobData {
  notificationId?: string
  userId: string
  type: string
  title: string
  message: string
}

export interface ActivityJobData {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}

// ─── Helper functions to enqueue jobs ───────────────────────────

let redisAvailable: boolean | null = null

async function isRedisAvailable(): Promise<boolean> {
  if (!REDIS_URL) return false
  if (redisAvailable !== null) return redisAvailable
  try {
    const IORedis = (await import('ioredis')).default
    const redis = new IORedis(REDIS_URL, { connectTimeout: 3000, lazyConnect: true })
    await redis.connect()
    await redis.ping()
    await redis.disconnect()
    redisAvailable = true
  } catch {
    redisAvailable = false
  }
  return redisAvailable
}

/** Enqueue an email job. Returns false if Redis is unavailable (caller should send inline). */
export async function enqueueEmail(data: EmailJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getEmailQueue()
  if (!q) return false
  await q.add(data.type, data)
  return true
}

/** Enqueue a notification creation job. Returns false if Redis is unavailable. */
export async function enqueueNotification(data: NotificationJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getNotificationQueue()
  if (!q) return false
  await q.add('create', data)
  return true
}

/** Enqueue an activity log job. Returns false if Redis is unavailable. */
export async function enqueueActivity(data: ActivityJobData): Promise<boolean> {
  if (!(await isRedisAvailable())) return false
  const q = getActivityQueue()
  if (!q) return false
  await q.add('log', data)
  return true
}
