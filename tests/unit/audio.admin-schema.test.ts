import { audioFieldsSchema, audioQuerySchema, changeAudioSchema, createAudioSchema } from '@/lib/audio/admin-schema'
const fields = { title: '  Quiet morning  ', description: '', category: ' Meditation ', audioUrl: '', duration: 300, isPremium: false }
test('new audio can be a valid private draft without a media URL', () => {
  expect(createAudioSchema.parse({ ...fields, slug: ' Quiet-Morning ' })).toEqual({ ...fields, title: 'Quiet morning', category: 'Meditation', slug: 'quiet-morning' })
})
test.each(['http://media.example.test/a.mp3', 'javascript:alert(1)', 'https://user:password@media.example.test/a.mp3', 'https://media.example.test/a b.mp3', 'data:audio/mp3;base64,AA'])('rejects unsafe media location %s', audioUrl => expect(audioFieldsSchema.safeParse({ ...fields, audioUrl }).success).toBe(false))
test.each([0, -1, 1.5, 86401, NaN, '300'])('rejects invalid duration %s', duration => expect(audioFieldsSchema.safeParse({ ...fields, duration }).success).toBe(false))
test.each([{ isPublished: true }, { role: 'ADMIN' }, { slug: '../private' }, { title: '' }, { category: '' }])('new drafts reject unsupported or invalid fields %p', overrides => expect(createAudioSchema.safeParse({ ...fields, slug: 'morning', ...overrides }).success).toBe(false))
test('only reviewed versions can publish or withdraw and slugs are immutable on edit', () => {
  const base = { id: 'track', version: 'a'.repeat(64) }
  expect(changeAudioSchema.safeParse({ ...base, change: { action: 'publish' } }).success).toBe(true)
  expect(changeAudioSchema.safeParse({ ...base, change: { action: 'withdraw' } }).success).toBe(true)
  expect(changeAudioSchema.safeParse({ id: 'track', change: { action: 'publish' } }).success).toBe(false)
  expect(changeAudioSchema.safeParse({ ...base, change: { action: 'details', fields: { ...fields, slug: 'replacement' } } }).success).toBe(false)
})
test.each([{ limit: 0 }, { limit: 101 }, { status: 'deleted' }, { q: 'x'.repeat(201) }, { unknown: true }])('admin queries are bounded and strict %p', query => expect(audioQuerySchema.safeParse(query).success).toBe(false))
