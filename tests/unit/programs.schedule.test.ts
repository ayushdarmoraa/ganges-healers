import { buildProgramSchedule, programFields, readProgramOutline } from '@/lib/programs/schedule'

test('a purchase outline retains its session count and duration independently of a later catalog edit', () => {
  const saved = buildProgramSchedule(3, 2, 90, new Date('2030-01-01T04:30:00Z')).sessions
  const outline = readProgramOutline(saved)
  expect(outline).toHaveLength(3)
  expect(outline?.map(row => row.durationMin)).toEqual([90, 90, 90])
  expect(outline?.map(row => row.sessionNumber)).toEqual([1, 2, 3])
  expect(outline?.every(row => !row.legacyCompleted)).toBe(true)
})
test.each([null, [], [{ scheduledAt: 'invalid', durationMinutes: 60 }], [{ scheduledAt: '2030-01-01T00:00:00Z', durationMinutes: 0 }], Array(367).fill({ scheduledAt: '2030-01-01T00:00:00Z', durationMinutes: 60 })])('malformed or unbounded purchased schedules require review: %j', input => { expect(readProgramOutline(input)).toBeNull() })
test.each([{ pricePaise: 0 }, { totalSessions: 0 }, { totalSessions: 10000000 }, { sessionsPerWeek: 0 }, { sessionsPerWeek: 8 }, { durationMinutes: -30 }])('rejects invalid catalog scheduling fields: %j', changes => {
  expect(programFields.safeParse({ title: 'Program', slug: 'program', description: 'Description', pricePaise: 10000, totalSessions: 8, sessionsPerWeek: 2, durationMinutes: 60, ...changes }).success).toBe(false)
})
