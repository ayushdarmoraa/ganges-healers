import nock from 'nock'

// Block all outbound network in tests except localhost, unless explicitly allowed
beforeAll(() => {
  if (process.env.ALLOW_NET_CONNECT === 'true') {
    // Escape hatch for rare local debugging
  console.warn('[network-guard] ALLOW_NET_CONNECT=true — external network allowed for this run')
    return
  }
  nock.disableNetConnect()
  // Allow only localhost and 127.0.0.1
  nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/)
})

afterAll(() => {
  // Clean and re-enable to avoid leakage across suites/workers
  nock.cleanAll()
  nock.enableNetConnect()
})
