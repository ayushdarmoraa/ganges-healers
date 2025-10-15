import { makeServiceCrumbs, makeProgramCrumbs, makeHealerCrumbs, makeProductCrumbs } from '@/lib/seo/breadcrumbs'

describe('seo breadcrumbs helpers', () => {
  test('service crumbs title-cases slug when title missing', () => {
    const cs = makeServiceCrumbs('yoga-healing')
    expect(cs.length).toBe(3)
    expect(cs[0].href).toBe('/')
    expect(cs[1].href).toBe('/services')
    expect(cs[2].href).toBe('/services/yoga-healing')
    expect(cs[2].name).toBe('Yoga Healing')
  })

  test('program crumbs', () => {
    const cs = makeProgramCrumbs('foundation-6-week')
    expect(cs.map(c => c.href)).toEqual(['/', '/programs', '/programs/foundation-6-week'])
    expect(cs[2].name).toBe('Foundation 6 Week')
  })

  test('healer crumbs', () => {
    const cs = makeHealerCrumbs('anita-sharma')
    expect(cs.map(c => c.href)).toEqual(['/', '/healers', '/healers/anita-sharma'])
    expect(cs[2].name).toBe('Anita Sharma')
  })

  test('product crumbs', () => {
    const cs = makeProductCrumbs('copper-bottle')
    expect(cs.map(c => c.href)).toEqual(['/', '/store', '/store/copper-bottle'])
    expect(cs[2].name).toBe('Copper Bottle')
  })
})
