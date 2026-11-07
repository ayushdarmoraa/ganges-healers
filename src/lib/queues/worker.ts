/**
 * BullMQ Worker — processes email, notification, and activity log jobs.
 *
 * Run separately: npx tsx src/lib/queues/worker.ts
 */
import { Worker } from 'bullmq'
import type { EmailJobData, NotificationJobData, ActivityJobData } from './jobs'
import { storeNotification } from '../notifications/delivery'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

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

const connection = parseRedisUrl(REDIS_URL)

// ─── Email Worker ──────────────────────────────────────────────

const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job) => {
    // Dynamic import to avoid loading email service on module load
    const { emailService } = await import('../email/email.service')

    switch (job.data.type) {
      case 'booking_confirmation':
        await emailService.sendBookingConfirmation(job.data.payload)
        break
      case 'booking_cancellation':
        await emailService.sendBookingCancellation(job.data.payload)
        break
      case 'booking_reminder':
        await emailService.sendBookingReminder(job.data.payload)
        break
      case 'invoice':
        await emailService.sendInvoiceEmail(job.data.payload)
        break
    }
  },
  { connection, concurrency: 5 }
)

// ─── Notification Worker ───────────────────────────────────────

const notificationWorker = new Worker<NotificationJobData>(
  'notification',
  async (job) => {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    try {
      await storeNotification(job.data, prisma)
    } finally {
      await prisma.$disconnect()
    }
  },
  { connection, concurrency: 3 }
)

// ─── Activity Log Worker ───────────────────────────────────────

const activityWorker = new Worker<ActivityJobData>(
  'activity',
  async (job) => {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    try {
      await prisma.activityLog.create({
        data: {
          userId: job.data.userId ?? undefined,
          action: job.data.action,
          entityType: job.data.entityType,
          entityId: job.data.entityId,
          metadata: job.data.metadata as import('@prisma/client').Prisma.InputJsonValue | undefined,
        },
      })
    } finally {
      await prisma.$disconnect()
    }
  },
  { connection, concurrency: 5 }
)

// ─── Lifecycle ─────────────────────────────────────────────────

function gracefulShutdown() {
  console.log('[worker] Shutting down...')
  Promise.all([
    emailWorker.close(),
    notificationWorker.close(),
    activityWorker.close(),
  ]).then(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

for (const w of [emailWorker, notificationWorker, activityWorker]) {
  w.on('failed', (job, err) => {
    console.error(`[worker][${w.name}] Job ${job?.id} failed:`, err.message)
  })
}

console.log('[worker] Email, Notification, and Activity workers started')
