describe('app robots route (preview disallow all)', () => {
  const OLD_URL = process.env.NEXT_PUBLIC_SITE_URL
  const OLD_R = process.env.NEXT_PUBLIC_ROBOTS
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example.com'
    process.env.NEXT_PUBLIC_ROBOTS = 'disallow_all'
  })
  afterAll(() => { process.env.NEXT_PUBLIC_SITE_URL = OLD_URL; process.env.NEXT_PUBLIC_ROBOTS = OLD_R })

  it('returns a single disallow-all rule and absolute sitemap', async () => {
    const robots = (await import('@/app/robots')).default
    const res = robots()
    const rules = Array.isArray(res.rules) ? res.rules : [res.rules]
    expect(rules.length).toBeGreaterThanOrEqual(1)
    expect(rules[0].userAgent).toBe('*')
    const dis = rules[0].disallow
    const arr = Array.isArray(dis) ? dis : [dis]
    expect(arr).toEqual(['/'])
    expect(res.sitemap).toBe('https://preview.example.com/sitemap.xml')
  })
})
