'use client'

import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
let ownerId: string | null = null

/**
 * Lazily connect to the Socket.IO server.
 * The server derives the room from its verified session cookie, not this local owner hint.
 */
export function getSocket(userId: string): Socket {
  if (ownerId !== userId) disconnectSocket()
  if (!socket) {
    ownerId = userId
    socket = io({
      path: '/api/socketio',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  ownerId = null
}
