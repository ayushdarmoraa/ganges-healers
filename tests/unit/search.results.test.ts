import { searchResultsSchema, searchSuggestionGroups } from '@/lib/search/results'

const empty = { services: [], healers: [], programs: [], courses: [], products: [], blog: [], audio: [] }

test('an empty valid search has no invented suggestions', () => {
  expect(searchSuggestionGroups(searchResultsSchema.parse(empty))).toEqual([])
})

test('all seven existing result types have actual internal resource destinations', () => {
  const priced = { id: 'row', slug: 'practice', title: 'Practice', pricePaise: 0 }
  const rows = searchResultsSchema.parse({
    services: [{ id: 'service', slug: 'reiki', name: 'Reiki', category: 'Healing', tagline: null }],
    healers: [{ id: 'healer', bio: null, specializations: ['Reiki'], user: { name: null, image: null } }],
    programs: [priced], courses: [{ ...priced, imageUrl: null }], products: [{ ...priced, imageUrl: null }],
    blog: [{ id: 'blog', slug: 'practice', title: 'Article', excerpt: null, createdAt: '2026-10-01T12:00:00Z' }],
    audio: [{ id: 'audio', slug: 'practice', title: 'Audio', category: 'Meditation', duration: 0, isPremium: true }],
  })
  expect(searchSuggestionGroups(rows).map(group => group.items[0].href)).toEqual(['/services/reiki', '/healers/healer', '/programs/practice', '/courses/practice', '/store/practice', '/blog/practice', '/audio/practice'])
  expect(searchSuggestionGroups(rows)[1].items[0].label).toBe('Healer')
})

test('suggestion limits bound each group without dropping whole resource types', () => {
  const rows = searchResultsSchema.parse({ ...empty, programs: Array.from({ length: 6 }, (_, i) => ({ id: String(i), slug: `practice-${i}`, title: 'Practice', pricePaise: 0 })) })
  expect(searchSuggestionGroups(rows)[0].items).toHaveLength(3)
  expect(searchSuggestionGroups(rows, 2)[0].items).toHaveLength(2)
})

test.each([{}, { ...empty, services: null }, { ...empty, products: [{ id: 'p', slug: 'p', title: 'Product', pricePaise: 'free', imageUrl: null }] }, { ...empty, programs: [{ id: 'p', slug: '..', title: 'Bad path', pricePaise: 0 }] }])('malformed success payloads are rejected instead of claiming no matches', body => {
  expect(searchResultsSchema.safeParse(body).success).toBe(false)
})

test('resource fields are encoded and untrusted remote hrefs are ignored', () => {
  const rows = searchResultsSchema.parse({ ...empty, programs: [{ id: 'p', slug: '//foreign.example?q=1#x', title: '<script>Shown as text</script>', pricePaise: 0, href: 'https://foreign.example' }] })
  expect(rows.programs[0]).not.toHaveProperty('href')
  expect(searchSuggestionGroups(rows)[0].items[0]).toMatchObject({ href: '/programs/%2F%2Fforeign.example%3Fq%3D1%23x', label: '<script>Shown as text</script>' })
})
