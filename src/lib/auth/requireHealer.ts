import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface StatusError extends Error { status?: number }

export async function requireHealer() {
  const session = await auth()

  if (!session?.user?.id) {
    const err: StatusError = new Error('Unauthorized')
    err.status = 401
    throw err
  }

  if (session.user.role !== 'HEALER') {
    const err: StatusError = new Error('Forbidden: healer only')
    err.status = 403
    throw err
  }

  const healer = await prisma.healer.findUnique({
    where: { userId: session.user.id },
    include: { user: { select: { role: true } } },
  })

  if (!healer) {
    const err: StatusError = new Error('Healer record not found')
    err.status = 403
    throw err
  }

  if (healer.user.role !== 'HEALER') {
    const err: StatusError = new Error('Forbidden: healer only')
    err.status = 403
    throw err
  }

  return { user: session.user, healer }
}
