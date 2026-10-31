import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/community/posts/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const users: string[] = []
let topicId: string
let tagId: string
let ownPostId: string
const request = (query: Record<string, string>) => new NextRequest(`http://localhost/api/community/posts?${new URLSearchParams(query)}`)

beforeAll(async () => {
  for (let index = 0; index < 2; index++) users.push((await prisma.user.create({ data: { email: `community-browse-${crypto.randomUUID()}@example.test`, role: 'USER' } })).id)
  topicId = (await prisma.communityTopic.create({ data: { slug: `topic-${crypto.randomUUID()}`, name: 'Browsing topic' } })).id
  tagId = (await prisma.communityTag.create({ data: { slug: `tag-${crypto.randomUUID()}`, name: 'Browsing tag' } })).id
  const own = await prisma.communityPost.create({ data: { userId: users[0], topicId, title: 'mindfulquartz practice', content: 'A searchable discussion', createdAt: new Date('2026-01-01T12:00:00Z'), tags: { create: { tagId } } } })
  ownPostId = own.id
  await prisma.communityPost.create({ data: { userId: users[1], topicId, title: 'mindfulquartz other account', content: 'Another discussion', tags: { create: { tagId } } } })
  await prisma.communityPost.create({ data: { userId: users[0], topicId, title: 'mindfulquartz deleted', content: 'Deleted discussion', deletedAt: new Date() } })
  await prisma.$executeRaw`UPDATE "CommunityPost" SET "searchVector" = to_tsvector('english', "title" || ' ' || "content") WHERE "userId" IN (${Prisma.join(users)})`
  auth.mockResolvedValue({ user: { id: users[0] } })
})

afterAll(async () => {
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
  if (topicId) await prisma.communityTopic.delete({ where: { id: topicId } })
  if (tagId) await prisma.communityTag.delete({ where: { id: tagId } })
  await prisma.$disconnect()
})

test('owned browsing cannot return another account’s or deleted posts', async () => {
  const response = await GET(request({ mine: '1', userId: users[1] }))
  expect(response.status).toBe(200)
  expect((await response.json()).data.map((post: { id: string }) => post.id)).toEqual([ownPostId])
})

test('full-text search retains account, topic, and tag restrictions', async () => {
  const response = await GET(request({ mine: '1', topicId, tagId, search: 'mindfulquartz' }))
  expect(response.status).toBe(200)
  expect((await response.json()).data.map((post: { id: string }) => post.id)).toEqual([ownPostId])
})

test('pinned posts are not repeated on the next owned page', async () => {
  const pinned = await prisma.communityPost.create({ data: { userId: users[0], topicId, title: 'Pinned', content: 'Pinned discussion', isPinned: true } })
  await prisma.communityPost.create({ data: { userId: users[0], topicId, title: 'Newer', content: 'Newer discussion', createdAt: new Date('2026-01-02T12:00:00Z') } })
  const first = await (await GET(request({ mine: '1', take: '1' }))).json()
  expect(first.data.map((post: { id: string }) => post.id)).toContain(pinned.id)
  expect(first.nextCursor).toBeTruthy()
  const next = await (await GET(request({ mine: '1', take: '1', cursor: first.nextCursor }))).json()
  expect(next.data.map((post: { id: string }) => post.id)).toEqual([ownPostId])
})
