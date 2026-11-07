/**
 * Startup environment validation.
 * Import at the top of instrumentation.ts or server entry to fail fast.
 */

import { assertProductionTestModeDisabled } from './test-mode'

const required: string[] = [
  'DATABASE_URL',
  'AUTH_SECRET',
]

const requiredForPayments: string[] = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
]

export function validateEnv() {
  assertProductionTestModeDisabled()
  const missing: string[] = []

  for (const key of required) {
    if (!process.env[key] && !(key === 'AUTH_SECRET' && process.env.NEXTAUTH_SECRET)) {
      missing.push(key)
    }
  }

  const optionalServices: Array<{ key: string; label: string }> = [
    { key: 'BLOB_READ_WRITE_TOKEN', label: 'Blob storage (avatar uploads, invoice PDFs)' },
    { key: 'REDIS_URL', label: 'Redis (background jobs, caching)' },
    { key: 'NEXT_PUBLIC_SENTRY_DSN', label: 'Sentry error monitoring' },
    { key: 'RESEND_API_KEY', label: 'Transactional email' },
    { key: 'INTERAKT_API_KEY', label: 'WhatsApp messaging (Interakt)' },
    { key: 'NEXT_PUBLIC_META_PIXEL_ID', label: 'Meta Pixel (Facebook/Instagram ads)' },
    { key: 'CRON_SECRET', label: 'Cron job authentication' },
  ]

  // Warn for payment keys instead of failing (dev mode may not need them)
  const missingPayment: string[] = []
  for (const key of requiredForPayments) {
    if (!process.env[key]) missingPayment.push(key)
  }

  const missingOptional: string[] = []
  for (const { key, label } of optionalServices) {
    if (!process.env[key]) missingOptional.push(`${key} — ${label}`)
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join('\n  ')}\n\nSee .env.example for reference.`
    )
  }

  if (missingPayment.length > 0) {
    console.warn(
      `⚠️  Missing payment environment variables (payments will fail):\n  ${missingPayment.join('\n  ')}`
    )
  }

  if (missingOptional.length > 0) {
    console.warn(
      `ℹ️  Optional services not configured:\n  ${missingOptional.join('\n  ')}`
    )
  }
}
