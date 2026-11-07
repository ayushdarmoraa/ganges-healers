import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/admin/upload-product-image/route'

let mockActor: { user: { id: string; role: string } } | null = null
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => mockActor) }))
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }))
const put = jest.requireMock<{ put: jest.Mock }>('@vercel/blob').put
const getOidcToken = jest.requireMock<{ getVercelOidcToken: jest.Mock }>('@vercel/oidc').getVercelOidcToken
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCioAAAAASUVORK5CYII=', 'base64')
const users: string[] = []
const saved = { mode: process.env.TEST_MODE, storeId: process.env.PRODUCT_IMAGES_BLOB_STORE_ID, dedicated: process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN, legacy: process.env.BLOB_READ_WRITE_TOKEN }
function request() { const data = new FormData(); data.set('file', new File([png], 'private-name.png', { type: 'image/png' })); return new Request('http://localhost/api/admin/upload-product-image', { method: 'POST', body: data }) }
beforeAll(async () => {
  process.env.TEST_MODE = '0'
  for (const role of ['ADMIN', 'USER', 'HEALER'] as const) users.push((await prisma.user.create({ data: { email: `upload-${randomUUID()}@example.test`, role } })).id)
})
beforeEach(() => { jest.clearAllMocks(); mockActor = { user: { id: users[0], role: 'ADMIN' } }; delete process.env.PRODUCT_IMAGES_BLOB_STORE_ID; process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN = 'isolated-test-token'; getOidcToken.mockReset().mockResolvedValue('fresh-test-identity'); put.mockResolvedValue({ url: 'https://photos.public.blob.vercel-storage.com/products/fixture.png' }) })
afterAll(async () => {
  try { await prisma.user.deleteMany({ where: { id: { in: users } } }) }
  finally { for (const [key, value] of [['TEST_MODE', saved.mode], ['PRODUCT_IMAGES_BLOB_STORE_ID', saved.storeId], ['PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN', saved.dedicated], ['BLOB_READ_WRITE_TOKEN', saved.legacy]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value }; await prisma.$disconnect() }
})

test('a real current administrator can upload without changing user or purchase rows', async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })
  const response = await POST(request()); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(put).toHaveBeenCalledTimes(1)
  expect(await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).toEqual(before)
})
test('customers and practitioners cannot upload even when a stale session claims administrator role', async () => {
  for (const id of users.slice(1)) { mockActor = { user: { id, role: 'ADMIN' } }; expect((await POST(request())).status).toBe(403) }
  expect(put).not.toHaveBeenCalled()
})
test('a revoked administrator is rejected using the current database role', async () => {
  try { await prisma.user.update({ where: { id: users[0] }, data: { role: 'USER' } }); expect((await POST(request())).status).toBe(403); expect(put).not.toHaveBeenCalled() }
  finally { await prisma.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } }) }
})
test('missing or deleted actors do not reach storage', async () => {
  mockActor = null; expect((await POST(request())).status).toBe(403)
  mockActor = { user: { id: randomUUID(), role: 'ADMIN' } }; expect((await POST(request())).status).toBe(403); expect(put).not.toHaveBeenCalled()
})
test('a valid administrator gets an explicit unavailable response when no store is configured', async () => {
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN
  expect((await POST(request())).status).toBe(503); expect(put).not.toHaveBeenCalled()
})
test('current database authorization also gates a dedicated OIDC photo store', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN
  mockActor = { user: { id: users[1], role: 'ADMIN' } }
  expect((await POST(request())).status).toBe(403); expect(getOidcToken).not.toHaveBeenCalled()
  mockActor = { user: { id: users[0], role: 'ADMIN' } }
  expect((await POST(request())).status).toBe(200)
  expect(put.mock.calls[0][2]).toMatchObject({ storeId: 'store_photos', oidcToken: 'fresh-test-identity' })
  expect(put.mock.calls[0][2]).not.toHaveProperty('token')
})
test('an authorized admin cannot upload to shared invoice storage when dedicated identity fails', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'; process.env.BLOB_READ_WRITE_TOKEN = 'shared-invoice-test-token'
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN
  getOidcToken.mockRejectedValue(new Error('identity unavailable'))
  expect((await POST(request())).status).toBe(503); expect(put).not.toHaveBeenCalled()
})
