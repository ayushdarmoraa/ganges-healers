import { renderCalendarEvent, calendarResponse } from '@/lib/bookings/calendar'
const event = { id: 'booking-example', title: 'Yoga, breathing; practice', description: 'With your practitioner', start: new Date('2030-01-01T04:30:00Z'), durationMin: 90, updatedAt: new Date('2026-11-05T12:00:00Z'), status: 'CONFIRMED' as const }
test('exports the real absolute interval and a stable identity without an external provider', () => {
  const calendar = renderCalendarEvent(event)
  expect(calendar).toContain('DTSTART:20300101T043000Z\r\n')
  expect(calendar).toContain('DTEND:20300101T060000Z\r\n')
  expect(calendar).toContain('UID:booking-example@gangeshealers\r\n')
  expect(calendar).toContain('SUMMARY:Yoga\\, breathing\\; practice\r\n')
  expect(calendar).not.toContain('ATTENDEE')
  expect(calendar).not.toContain('ORGANIZER')
})
test('untrusted text cannot inject another calendar event or property', () => {
  const result = renderCalendarEvent({ ...event, title: 'Title\r\nBEGIN:VEVENT\r\nATTENDEE:mailto:other@example.test', description: 'Path \\ name\nTwo lines' }).replace(/\r\n /g, '')
  expect(result.match(/(?:^|\r\n)BEGIN:VEVENT\r\n/g)).toHaveLength(1)
  expect(result).toContain('SUMMARY:Title\\nBEGIN:VEVENT\\nATTENDEE:mailto:other@example.test')
  expect(result).toContain('DESCRIPTION:Path \\\\ name\\nTwo lines')
})
test('folds UTF-8 on character boundaries with at most 75 bytes per physical line', () => {
  const result = renderCalendarEvent({ ...event, title: 'गंगा 🌿 '.repeat(80) })
  for (const line of result.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
  expect(result.replace(/\r\n /g, '')).toContain(`SUMMARY:${'गंगा 🌿 '.repeat(80)}\r\n`)
  expect(Buffer.from(result).toString('utf8')).not.toContain('\uFFFD')
})
test('omits unsafe meeting URLs and describes cancellation and tentative requests accurately', () => {
  expect(renderCalendarEvent({ ...event, meetingLink: 'javascript:alert(1)', status: 'CANCELLED' })).not.toContain('URL:')
  expect(renderCalendarEvent({ ...event, status: 'CANCELLED' })).toContain('STATUS:CANCELLED\r\n')
  expect(renderCalendarEvent({ ...event, status: 'TENTATIVE' })).toContain('STATUS:TENTATIVE\r\n')
  const response = calendarResponse(event)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
})
