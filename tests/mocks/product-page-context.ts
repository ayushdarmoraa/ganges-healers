// Direct server-page rendering has no Next request, auth session, or live database.
// Keep the page, gallery, CTA, and view tracker real; replace only their server
// context/query boundaries and external analytics transports.
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => null) }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: jest.fn(async () => null) }))
jest.mock('@/lib/experiments/ab-testing', () => ({ getVariant: jest.fn(async () => 'A') }))
jest.mock('@/lib/store/bundle-queries', () => ({ listBundles: jest.fn(async () => []) }))
jest.mock('@/lib/store/dynamic-bundle', () => ({
  getDynamicBundle: jest.fn(async () => ({ bundle: null, discountPct: 0, reason: null })),
}))
jest.mock('@/lib/analytics/track-client-event', () => ({ trackClientEvent: jest.fn() }))
jest.mock('@/lib/analytics/meta-pixel', () => ({ trackViewContent: jest.fn() }))
