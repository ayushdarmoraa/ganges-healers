import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as connect, type Socket } from 'socket.io-client'
import { registerNotificationSockets } from '../../src/lib/notifications/socket-auth'

// Native ESM runs the real Auth.js crypto and Socket.IO transport, without a database.
async function main() {
  const { encode } = await import('next-auth/jwt')
  const secret = process.env.AUTH_SECRET!
  const http = createServer()
  const io = new Server(http, { path: '/api/socketio', serveClient: false })
  registerNotificationSockets(io, 'http://localhost:3000')
  const clients: Socket[] = []
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const address = http.address()
  assert(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  const client = (cookie?: string, origin = 'http://localhost:3000', claimedUser = 'bob') => {
    const socket = connect(url, { path: '/api/socketio', autoConnect: false, transports: ['websocket'], forceNew: true, reconnection: false, timeout: 2000, auth: { userId: claimedUser }, extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin } })
    clients.push(socket)
    return socket
  }
  function event<T>(socket: Socket, name: string, timeout = 2500) {
    return new Promise<T>((resolve, reject) => {
      const receive = (value: T) => { clearTimeout(timer); resolve(value) }
      const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)) }, timeout)
      socket.once(name, receive)
    })
  }
  async function accepted(socket: Socket) { const connected = event(socket, 'connect'); socket.connect(); await connected }
  async function rejected(socket: Socket) { const denied = event<Error>(socket, 'connect_error'); socket.connect(); assert.equal((await denied).message, 'Unauthorized'); assert.equal(socket.connected, false) }
  try {
    const base = 'authjs.session-token'
    const secure = '__Secure-authjs.session-token'
    const aliceToken = await encode({ token: { id: 'alice', sub: 'alice' }, secret, salt: base, maxAge: 6 })
    const bobToken = await encode({ token: { id: 'bob', sub: 'bob' }, secret, salt: secure, maxAge: 60 })
    const alice = client(`${base}.0=${aliceToken.slice(0, 50)}; ${base}.1=${aliceToken.slice(50)}`)
    const bob = client(`${secure}=${bobToken}`, 'http://localhost:3000', 'alice')
    await accepted(alice); await accepted(bob)
    const expiry = event<string>(alice, 'disconnect', 8500)
    assert.deepEqual([...io.sockets.adapter.rooms.get('user:alice') || []], [alice.id])
    assert.deepEqual([...io.sockets.adapter.rooms.get('user:bob') || []], [bob.id])
    const aliceMessage = event<string>(alice, 'notification')
    const bobMessage = event<string>(bob, 'notification')
    io.to('user:alice').emit('notification', 'alice-only')
    io.to('user:bob').emit('notification', 'bob-only')
    assert.equal(await aliceMessage, 'alice-only'); assert.equal(await bobMessage, 'bob-only')
    await rejected(client())
    await rejected(client(`${base}=forged-token`))
    await rejected(client(`${base}=${await encode({ token: { id: 'alice' }, secret: 'different-synthetic-secret', salt: base, maxAge: 60 })}`))
    await rejected(client(`${base}=${await encode({ token: { id: 'alice' }, secret, salt: base, maxAge: -60 })}`))
    await rejected(client(`${secure}=${bobToken}`, 'https://foreign.example'))
    assert.equal(await expiry, 'io server disconnect')
    assert.equal(io.sockets.adapter.rooms.has('user:alice'), false)
    assert.equal(bob.connected, true)
    console.log('notification socket checks passed')
  } finally {
    clients.forEach(socket => socket.disconnect())
    await new Promise<void>(resolve => io.close(() => resolve()))
    if (http.listening) await new Promise<void>(resolve => http.close(() => resolve()))
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Socket verification failed'); process.exitCode = 1 })
