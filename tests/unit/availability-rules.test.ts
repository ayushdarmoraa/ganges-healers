import { fitsWorkingWindow, readWeeklyAvailability, weeklyAvailabilitySchema, workingWindowSlots } from '@/lib/bookings/availability-rules'

test('normalizes missing days and preserves the existing window response shape', () => {
  const schedule = weeklyAvailabilitySchema.parse({ monday: { start: '08:00', end: '22:00' } })
  expect(schedule.monday).toEqual({ start: '08:00', end: '22:00' })
  expect(Object.keys(schedule)).toHaveLength(7)
  expect(schedule.tuesday).toBeNull()
})
test.each([
  { monday: { start: '24:00', end: '24:00' } },
  { monday: { start: '10:00', end: '10:00' } },
  { monday: { start: '20:00', end: '08:00' } },
  { monday: { start: '10:15', end: '20:00' } },
  { monday: { start: '10:00', end: '20:15' } },
  { monday: { start: '10:00', end: 'x20:00x' } },
  { monday: { start: '10:00', end: '24:30' } },
  { monday: { start: '10:00', end: '20:00', ignored: true } },
  { healerId: 'another-healer' },
])('rejects unsupported or ambiguous writes (%j)', value => {
  expect(weeklyAvailabilitySchema.safeParse(value).success).toBe(false)
})
test('midnight closing is an end boundary, and duration must fit entirely before it', () => {
  const schedule = weeklyAvailabilitySchema.parse({ monday: { start: '22:00', end: '24:00' } })
  expect(workingWindowSlots(schedule.monday)).toEqual(['22:00', '22:30', '23:00', '23:30'])
  expect(fitsWorkingWindow(schedule.monday, '23:00', 60)).toBe(true)
  expect(fitsWorkingWindow(schedule.monday, '23:30', 60)).toBe(false)
})
test('legacy minute windows remain readable without creating off-grid appointments', () => {
  const schedule = readWeeklyAvailability({ monday: { start: '08:15', end: '10:45' } })
  expect(schedule?.monday).toEqual({ start: '08:15', end: '10:45' })
  expect(workingWindowSlots(schedule?.monday)).toEqual(['08:30', '09:00', '09:30', '10:00', '10:30'])
  expect(fitsWorkingWindow(schedule?.monday, '10:00', 60)).toBe(false)
})
test.each([[], 'not a schedule', { monday: { start: '08:00' } }, { unknown: true }])('stored malformed data fails closed (%j)', value => {
  expect(readWeeklyAvailability(value)).toBeNull()
})
test('an unconfigured schedule is days off and invalid appointment lengths never fit', () => {
  expect(readWeeklyAvailability(null)?.monday).toBeNull()
  expect(workingWindowSlots(null)).toEqual([])
  for (const duration of [0, -1, 0.5, Infinity]) expect(fitsWorkingWindow({ start: '08:00', end: '20:00' }, '10:00', duration)).toBe(false)
})
