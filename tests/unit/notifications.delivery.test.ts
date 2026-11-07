import { deliverNotification, storeNotification } from '@/lib/notifications/delivery'

jest.mock('@/lib/prisma', () => ({ prisma: { notification: { create: jest.fn(), upsert: jest.fn() } } }))
jest.mock('@/lib/queues/jobs', () => ({ enqueueNotification: jest.fn() }))
jest.mock('@/lib/socket', () => ({ emitNotification: jest.fn() }))
const db = jest.requireMock<{ prisma: { notification: { create: jest.Mock; upsert: jest.Mock } } }>('@/lib/prisma').prisma.notification
const enqueue = jest.requireMock<{ enqueueNotification: jest.Mock }>('@/lib/queues/jobs').enqueueNotification
const emit = jest.requireMock<{ emitNotification: jest.Mock }>('@/lib/socket').emitNotification
const input = { userId: 'alice', type: 'community_comment', title: 'New comment', message: 'A member replied.' }
const row = { id: 'notification-id', ...input, read: true, createdAt: new Date('2026-10-01T12:00:00Z') }
beforeEach(() => { jest.clearAllMocks(); db.upsert.mockResolvedValue(row); db.create.mockResolvedValue(row); enqueue.mockResolvedValue(false); emit.mockReset() })

test('no Redis persists a notification with one producer ID and only then emits', async () => {
  const result = await deliverNotification(input)
  expect(result).toEqual({ queued: false, id: row.id })
  const submitted = enqueue.mock.calls[0][0]
  expect(submitted.notificationId).toEqual(expect.any(String))
  expect(db.upsert).toHaveBeenCalledWith({ where: { id: submitted.notificationId }, create: { ...input, id: submitted.notificationId }, update: {} })
  expect(emit).toHaveBeenCalledWith('alice', { id: row.id, type: row.type, title: row.title, message: row.message, createdAt: row.createdAt.toISOString() })
  expect(db.upsert.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0])
})

test('confirmed queue acceptance leaves creation to the worker with the same retry ID', async () => {
  enqueue.mockResolvedValue(true)
  expect(await deliverNotification({ ...input, notificationId: 'stable-id' })).toEqual({ queued: true })
  expect(enqueue).toHaveBeenCalledWith({ ...input, notificationId: 'stable-id' })
  expect(db.upsert).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled()
})

test('uncertain enqueue failure is never submitted again through the database fallback', async () => {
  enqueue.mockRejectedValue(new Error('Queue connection lost after submission'))
  await expect(deliverNotification(input)).rejects.toThrow('Queue connection lost')
  expect(db.upsert).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled()
})

test('worker retries upsert the producer ID without resetting an already-read notification', async () => {
  expect(await storeNotification({ ...input, notificationId: row.id })).toMatchObject({ read: true })
  expect(db.upsert.mock.calls[0][0].update).toEqual({})
})

test('legacy queued jobs without IDs can still be processed', async () => {
  await storeNotification(input)
  expect(db.create).toHaveBeenCalledWith({ data: input })
  expect(db.upsert).not.toHaveBeenCalled()
})

test('a reused ID with different account or content is rejected before emitting', async () => {
  db.upsert.mockResolvedValue({ ...row, userId: 'bob' })
  await expect(storeNotification({ ...input, notificationId: row.id })).rejects.toThrow('identity conflict')
  expect(emit).not.toHaveBeenCalled()
})

test('failed persistence never emits and unavailable sockets do not undo persistence', async () => {
  db.upsert.mockRejectedValueOnce(new Error('Database unavailable'))
  await expect(storeNotification({ ...input, notificationId: row.id })).rejects.toThrow('Database unavailable')
  expect(emit).not.toHaveBeenCalled()
  emit.mockImplementation(() => { throw new Error('Socket unavailable') })
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try { expect(await storeNotification({ ...input, notificationId: row.id })).toEqual(row) } finally { warn.mockRestore() }
})
