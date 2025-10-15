import { makeServicesIndexCrumbs, makeProgramsIndexCrumbs, makeHealersIndexCrumbs, makeStoreIndexCrumbs } from '@/lib/seo/breadcrumbs'

describe('seo index breadcrumbs helpers', () => {
  test('services index crumbs', () => {
    const crumbs = makeServicesIndexCrumbs()
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0]).toEqual({ name: 'Home', href: '/' })
    expect(crumbs[1]).toEqual({ name: 'Services', href: '/services' })
  })
  test('programs index crumbs', () => {
    const crumbs = makeProgramsIndexCrumbs()
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0]).toEqual({ name: 'Home', href: '/' })
    expect(crumbs[1]).toEqual({ name: 'Programs', href: '/programs' })
  })
  test('healers index crumbs', () => {
    const crumbs = makeHealersIndexCrumbs()
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0]).toEqual({ name: 'Home', href: '/' })
    expect(crumbs[1]).toEqual({ name: 'Healers', href: '/healers' })
  })
  test('store index crumbs', () => {
    const crumbs = makeStoreIndexCrumbs()
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0]).toEqual({ name: 'Home', href: '/' })
    expect(crumbs[1]).toEqual({ name: 'Store', href: '/store' })
  })
})
