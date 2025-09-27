// One-off script to promote or create an admin user.
// Usage:
//   ADMIN_EMAIL=you@example.com pnpm tsx scripts/make-admin.ts
// Optionally set ADMIN_PASSWORD for a non-random password.

import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

async function main() {
  if (!process.env.ADMIN_EMAIL) {
    console.error('Refusing to run: set ADMIN_EMAIL=email@domain')
    process.exit(1)
  }
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex')

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', vip: true },
    create: { email, password, role: 'ADMIN', vip: true, freeSessionCredits: 1 }
  })
  console.log('Admin ready:', { id: user.id, email: user.email })
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Generated temporary password (store securely & rotate):', password)
  }
}

main()
  .catch(err => {
    console.error('[make-admin] failed:', err.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

