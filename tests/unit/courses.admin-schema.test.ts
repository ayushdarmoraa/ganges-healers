import { courseAdminQuerySchema, createCourseSchema, lessonFieldsSchema, updateCourseSchema } from '@/lib/courses/admin-schema'

const course = { title: 'A course', description: 'Course overview', slug: 'daily-practice', pricePaise: 0, imageUrl: '' }
test('new course fields normalize ordinary text and preserve a zero-price quote', () => {
  expect(createCourseSchema.parse({ ...course, title: ' A course ', slug: ' DAILY-PRACTICE ' })).toEqual(course)
})
test.each([-1, 1.5, 2147483648, Number.NaN, '100'])('rejects invalid course price %s', pricePaise => {
  expect(createCourseSchema.safeParse({ ...course, pricePaise }).success).toBe(false)
})
test.each(['javascript:alert(1)', 'https://example.test/cover.jpg', 'https://user:password@avatars.githubusercontent.com/a', 'http://avatars.githubusercontent.com/a'])('rejects unsafe or unconfigured cover URL %s', imageUrl => {
  expect(createCourseSchema.safeParse({ ...course, imageUrl }).success).toBe(false)
})
test('allows configured cover images and refuses caller-controlled publication fields', () => {
  expect(createCourseSchema.safeParse({ ...course, imageUrl: 'https://avatars.githubusercontent.com/example' }).success).toBe(true)
  expect(createCourseSchema.safeParse({ ...course, isActive: true }).success).toBe(false)
})
test('a text-only lesson is valid and a blank lesson cannot be saved', () => {
  expect(lessonFieldsSchema.safeParse({ title: 'Lesson', content: 'Licensed lesson text', videoUrl: '' }).success).toBe(true)
  expect(lessonFieldsSchema.safeParse({ title: 'Lesson', content: '  ', videoUrl: '' }).success).toBe(false)
})
test.each(['javascript:alert(1)', 'http://video.example.test/embed', 'https://user:password@video.example.test/embed', 'data:text/html,hello', 'https://video.example.test/a\nb'])('rejects unsafe lesson URL %s', videoUrl => {
  expect(lessonFieldsSchema.safeParse({ title: 'Lesson', content: '', videoUrl }).success).toBe(false)
})
test('media-only lessons accept HTTPS links without adding markup to lesson text', () => {
  expect(lessonFieldsSchema.parse({ title: 'Video', content: '<b>Plain text</b>', videoUrl: 'https://video.example.test/embed/lesson' }).content).toBe('<b>Plain text</b>')
})
test('writes require a saved version and only the named action fields', () => {
  expect(updateCourseSchema.safeParse({ id: 'course', change: { action: 'publish' } }).success).toBe(false)
  expect(updateCourseSchema.safeParse({ id: 'course', version: 'a'.repeat(64), change: { action: 'edit_lesson', lessonId: 'lesson', fields: { title: 'Lesson', content: 'Text', videoUrl: '', order: 99 } } }).success).toBe(false)
})
test('admin lists have bounded pagination and reject unknown query controls', () => {
  expect(courseAdminQuerySchema.parse({})).toEqual({ q: '', status: 'all', limit: 25 })
  expect(courseAdminQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
  expect(courseAdminQuerySchema.safeParse({ includePasswords: '1' }).success).toBe(false)
})
