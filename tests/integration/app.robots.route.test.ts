describe('app robots route', () => {
  const OLD = process.env.NEXT_PUBLIC_SITE_URL
  const OLD_R = process.env.NEXT_PUBLIC_ROBOTS
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    process.env.NEXT_PUBLIC_ROBOTS = 'production'
  })
  afterAll(() => { process.env.NEXT_PUBLIC_SITE_URL = OLD; process.env.NEXT_PUBLIC_ROBOTS = OLD_R })

  it('returns disallows for private surfaces and points to absolute sitemap', async () => {
    const robots = (await import('@/app/robots')).default
    const res = robots()
    expect(res.rules).toBeTruthy()
    // rules can be an object or array; normalize to array
    const rules = Array.isArray(res.rules) ? res.rules : [res.rules]
    const star = rules.find(r => r.userAgent === '*')
    expect(star).toBeTruthy()
    const dis = star!.disallow
    // disallow may be string or array; normalize to array
    const disArr = Array.isArray(dis) ? dis : [dis]
    expect(disArr).toEqual(expect.arrayContaining(['/api/', '/admin/', '/dashboard/', '/auth/']))
    expect(res.sitemap).toBe('https://example.com/sitemap.xml')
  })
})
