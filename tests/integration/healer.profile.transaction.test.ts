import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/healer/profile/route'

let mockUser = '', mockRole = 'HEALER'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUser ? { user: { id: mockUser, role: mockRole } } : null }))
let userId = '', healerId = ''
const hours = { monday: { start: '09:00', end: '17:00' } }
function save(body: unknown) { return PATCH(new NextRequest('http://localhost/api/healer/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) }
beforeEach(async () => {
  userId = (await prisma.user.create({ data: { email: `healer-bio-${randomUUID()}@example.test`, name: 'Practitioner', role: 'HEALER', password: 'preserved-credential' } })).id
  healerId = (await prisma.healer.create({ data: { userId, bio: 'Previous bio', experienceYears: 3, availability: hours, certifications: [{ name: 'Saved certificate', issuer: 'Saved issuer' }], isVerified: true } })).id
  mockUser = userId; mockRole = 'HEALER'
})
afterEach(async () => { await prisma.user.delete({ where: { id: userId } }) })
afterAll(async () => { await prisma.$disconnect() })

test('the actual editor payload can clear a bio while saving the other professional fields', async () => {
  const before = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  const account = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const response = await save({ bio: null, experienceYears: 7, certifications: [{ name: 'Updated certificate' }], specializations: ['Reiki', 'Sound Healing'] })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, data: { id: healerId, bio: null, experienceYears: 7, specializations: ['Reiki', 'Sound Healing'] } })
  const saved = await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })
  expect(saved).toEqual({ ...before, bio: null, experienceYears: 7, certifications: [{ name: 'Updated certificate' }], specializations: ['Reiki', 'Sound Healing'], updatedAt: saved.updatedAt })
  expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(account)
})
test('omitted bios retain the saved text and the existing maximum still rejects oversized drafts', async () => {
  expect((await save({ experienceYears: 5 })).status).toBe(200)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).bio).toBe('Previous bio')
  expect((await save({ bio: 'x'.repeat(2001), experienceYears: 10 })).status).toBe(400)
  expect(await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).toMatchObject({ bio: 'Previous bio', experienceYears: 5 })
})
test('clearing a bio retains the existing owner and current-role checks', async () => {
  mockUser = ''
  expect((await save({ bio: null })).status).toBe(401)
  mockUser = userId; mockRole = 'USER'
  expect((await save({ bio: null })).status).toBe(403)
  mockRole = 'HEALER'
  await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } })
  expect((await save({ bio: null })).status).toBe(403)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).bio).toBe('Previous bio')
})
