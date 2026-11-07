import type { Server, Socket } from 'socket.io'
import { prisma } from '@/lib/prisma'
import { sessionCredentialVersion } from '@/lib/auth/password-version'

interface SocketIdentity { userId: string; expiresAt: number }
type VerifyCredential = (userId: string, version: unknown) => Promise<boolean>
const verifyCredential: VerifyCredential = async (userId, version) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, securityVersion: true, closedAt: true } })
  return Boolean(user && !user.closedAt && typeof version === 'string' && version === sessionCredentialVersion(user.password, user.securityVersion))
}

/** Decode only server-issued Auth.js session cookies; the handshake's claimed user ID is ignored. */
export async function notificationSocketIdentity(cookie: string | undefined, verify: VerifyCredential = verifyCredential): Promise<SocketIdentity | null> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!cookie || !secret) return null
  const { getToken } = await import('next-auth/jwt')
  const headers = new Headers({ cookie })
  for (const cookieName of ['__Secure-authjs.session-token', 'authjs.session-token']) {
    const token = await getToken({ req: { headers }, secret, cookieName, salt: cookieName })
    const userId = typeof token?.id === 'string' ? token.id : token?.sub
    if (userId && userId.length <= 200 && typeof token?.exp === 'number' && Number.isFinite(token.exp) && token.exp * 1000 > Date.now() && await verify(userId, token.passwordVersion)) return { userId, expiresAt: token.exp * 1000 }
  }
  return null
}

/** The same registration is used by the custom server and the real transport test. */
export function registerNotificationSockets(io: Server, siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', verify: VerifyCredential = verifyCredential) {
  io.use(async (socket: Socket, next) => {
    try {
      // CORS alone does not protect WebSocket upgrades from a foreign browser origin.
      const origin = socket.handshake.headers.origin
      if (origin && new URL(origin).origin !== new URL(siteUrl).origin) return next(new Error('Unauthorized'))
      const identity = await notificationSocketIdentity(socket.request.headers.cookie, verify)
      if (!identity) return next(new Error('Unauthorized'))
      socket.data.notificationIdentity = identity
      next()
    } catch { next(new Error('Unauthorized')) }
  })
  io.on('connection', socket => {
    const identity = socket.data.notificationIdentity as SocketIdentity
    void socket.join(`user:${identity.userId}`)
    let timer: ReturnType<typeof setTimeout>
    const expire = () => {
      const remaining = identity.expiresAt - Date.now()
      if (remaining <= 0) { socket.disconnect(true); return }
      timer = setTimeout(() => {
        // Long-lived transports must also stop accepting a reset or deleted account's old cookie.
        void notificationSocketIdentity(socket.request.headers.cookie, verify).then(fresh => {
          if (!socket.connected) return
          if (!fresh) socket.disconnect(true)
          else expire()
        }).catch(() => socket.disconnect(true))
      }, Math.min(remaining, 30_000))
      timer.unref()
    }
    expire()
    socket.once('disconnect', () => clearTimeout(timer))
  })
}
