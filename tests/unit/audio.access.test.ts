import { GET as listAudio } from '@/app/api/audio/route'
import { GET as getAudio } from '@/app/api/audio/[slug]/route'
import { cacheSet, cacheDeleteByPrefix } from '@/lib/cache'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  audioTrack: { findMany: jest.fn(), findFirst: jest.fn() },
  vIPMembership: { findFirst: jest.fn() },
  programEnrollment: { findFirst: jest.fn() },
  courseEnrollment: { findFirst: jest.fn() },
} }))

const db = jest.requireMock<{ prisma: Record<string, Record<string, jest.Mock>> }>('@/lib/prisma').prisma
const mockAuth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const premium = {
  id: 'premium', slug: 'premium-track', title: 'Premium Track', category: 'Meditation',
  audioUrl: 'https://media.example.test/private-track.mp3', duration: 300, isPremium: true,
}
const free = { ...premium, id: 'free', slug: 'free-track', audioUrl: 'https://media.example.test/free-track.mp3', isPremium: false }

function detail() {
  return getAudio(new Request('http://localhost/api/audio/premium-track'), { params: Promise.resolve({ slug: premium.slug }) })
}

beforeEach(() => {
  jest.resetAllMocks()
  cacheDeleteByPrefix('audio:list:')
  mockAuth.mockResolvedValue(null)
  db.audioTrack.findMany.mockImplementation(async args => args.distinct ? [{ category: 'Meditation' }] : [premium, free])
  db.audioTrack.findFirst.mockResolvedValue(premium)
  db.vIPMembership.findFirst.mockResolvedValue(null)
  db.programEnrollment.findFirst.mockResolvedValue(null)
  db.courseEnrollment.findFirst.mockResolvedValue(null)
})
afterEach(() => cacheDeleteByPrefix('audio:list:'))

describe('public audio catalog', () => {
  test('redacts premium media while preserving free media and catalog metadata', async () => {
    const response = await listAudio(new Request('http://localhost/api/audio'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tracks: [{ ...premium, audioUrl: null }, free], categories: ['Meditation'] })
    expect(mockAuth).not.toHaveBeenCalled()
  })

  test('redacts a warm cache without mutating cached records', async () => {
    const cachedTracks = [premium, free]
    cacheSet('audio:list:all', { tracks: cachedTracks, categories: ['Meditation'] })
    for (let i = 0; i < 2; i++) {
      const response = await listAudio(new Request('http://localhost/api/audio'))
      expect(await response.text()).not.toContain(premium.audioUrl)
    }
    expect(db.audioTrack.findMany).not.toHaveBeenCalled()
    expect(cachedTracks[0].audioUrl).toBe(premium.audioUrl)
  })

  test('preserves category filtering and the access policy for cached results', async () => {
    const url = 'http://localhost/api/audio?category=Meditation'
    await listAudio(new Request(url))
    const response = await listAudio(new Request(url))
    expect(db.audioTrack.findMany).toHaveBeenCalledTimes(2)
    expect(db.audioTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { category: 'Meditation' } }))
    expect((await response.json()).tracks[0].audioUrl).toBeNull()
  })
})

describe('audio playback access', () => {
  test('denies anonymous premium playback without disclosing the URL', async () => {
    const response = await detail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ audioUrl: null, locked: true })
    expect(db.vIPMembership.findFirst).not.toHaveBeenCalled()
  })

  test('denies a signed-in user without any entitlement', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'listener', vip: false } })
    const response = await detail()
    expect(await response.json()).toMatchObject({ audioUrl: null, locked: true })
    for (const model of ['vIPMembership', 'programEnrollment', 'courseEnrollment']) {
      expect(db[model].findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'listener', status: 'active' } }))
    }
  })

  test.each(['vip', 'vIPMembership', 'programEnrollment', 'courseEnrollment'])('allows the existing %s entitlement through the detail endpoint', async entitlement => {
    mockAuth.mockResolvedValue({ user: { id: 'listener', vip: entitlement === 'vip' } })
    if (entitlement !== 'vip') db[entitlement].findFirst.mockResolvedValue({ id: 'entitlement' })
    const response = await detail()
    expect(await response.json()).toMatchObject({ audioUrl: premium.audioUrl, locked: false })
  })

  test('keeps free playback public', async () => {
    db.audioTrack.findFirst.mockResolvedValue(free)
    expect(await (await detail()).json()).toMatchObject({ audioUrl: free.audioUrl, locked: false })
    expect(mockAuth).not.toHaveBeenCalled()
  })

  test('preserves the missing-track response', async () => {
    db.audioTrack.findFirst.mockResolvedValue(null)
    const response = await detail()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Track not found' })
  })
})
