import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/services/route'
import { PUT } from '@/app/api/services/[id]/route'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { maxServicePrice, serviceFormSchema } from '@/lib/services/catalog-schema'

jest.mock('@/lib/prisma', () => ({ prisma: { service: { create: jest.fn(), update: jest.fn() } } }))
jest.mock('@/lib/rbac', () => ({ requireAdmin: jest.fn() }))

const create = jest.mocked(prisma.service.create)
const update = jest.mocked(prisma.service.update)
const admin = jest.mocked(requireAdmin)
const input = { name: '  Guided Session ', description: 'A description', category: 'Wellness', price: '0', duration: '60' }
const record = { id: 'service' }
const params = { params: Promise.resolve({ id: record.id }) }
const request = (method: 'POST' | 'PUT', body: string) =>
  new NextRequest(`http://localhost/api/services${method === 'PUT' ? '/service' : ''}`, {
    method, body, headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  jest.resetAllMocks()
  create.mockResolvedValue(record as never)
  update.mockResolvedValue(record as never)
})

test('the admin form accepts paise and rejects malformed slugs', () => {
  const fields = { ...input, price: '.29', mode: 'ONLINE' }
  expect(serviceFormSchema.parse({ ...fields, slug: 'guided-session' })).toMatchObject({ price: 0.29, duration: 60 })
  expect(serviceFormSchema.safeParse({ ...fields, slug: 'guided/session' }).success).toBe(false)
})

test('creating a free service keeps the existing response and generated slug', async () => {
  const response = await POST(request('POST', JSON.stringify(input)))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ success: true, data: record })
  expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
    name: 'Guided Session', slug: 'guided-session', price: 0, duration: 60, mode: 'BOTH', isActive: true,
  }) })
})

test.each([
  { price: -1 }, { price: '10rupees' }, { price: 0.001 }, { price: 1e-9 },
  { price: maxServicePrice + 1 }, { price: false }, { duration: 0 },
  { duration: 1441 }, { duration: 1.5 }, { duration: '60min' },
  { mode: 'REMOTE' }, { name: '   ' }, { benefits: [{ text: 'Invalid' }] },
])('invalid catalog fields produce 400 before either write (%j)', async change => {
  expect((await POST(request('POST', JSON.stringify({ ...input, ...change })))).status).toBe(400)
  expect((await PUT(request('PUT', JSON.stringify(change)), params)).status).toBe(400)
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
})

test.each(['{', 'null', '[]'])('invalid request bodies never reach Prisma (%s)', async body => {
  expect((await POST(request('POST', body))).status).toBe(400)
  expect((await PUT(request('PUT', body), params)).status).toBe(400)
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
})

test('partial updates may clear optional fields and keep unrelated properties out of the write', async () => {
  const response = await PUT(request('PUT', JSON.stringify({ price: maxServicePrice, tagline: null, benefits: [] })), params)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: record })
  expect(update).toHaveBeenCalledWith({ where: { id: record.id }, data: {
    price: maxServicePrice, tagline: null, benefits: [], updatedAt: expect.any(Date),
  } })
})

test.each([{ id: 'replacement' }, { bookings: { deleteMany: {} } }, { updatedAt: '2000-01-01' }])(
  'updates reject non-catalog and relational fields (%j)', async change => {
    expect((await PUT(request('PUT', JSON.stringify(change)), params)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  },
)

test('a database uniqueness conflict is reported for a racing create or update', async () => {
  const duplicate = new Prisma.PrismaClientKnownRequestError('Duplicate slug', { code: 'P2002', clientVersion: 'test' })
  create.mockRejectedValueOnce(duplicate)
  update.mockRejectedValueOnce(duplicate)
  for (const response of [
    await POST(request('POST', JSON.stringify(input))),
    await PUT(request('PUT', JSON.stringify({ slug: 'existing' })), params),
  ]) {
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Service already exists' })
  }
})

test('unauthorized requests are rejected before validation or writes', async () => {
  admin.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  expect((await POST(request('POST', '{'))).status).toBe(403)
  expect((await PUT(request('PUT', '{'), params)).status).toBe(403)
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
})
