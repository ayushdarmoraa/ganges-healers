type Environment = Readonly<Record<string, string | undefined>>

/** Server shortcuts require explicit opt-in and a known non-production runtime. */
export function isTestMode(environment: Environment = process.env): boolean {
  return environment.TEST_MODE === '1' &&
    (environment.NODE_ENV === 'test' || environment.NODE_ENV === 'development')
}

/** Fail startup if a production build is configured to expose test shortcuts. */
export function assertProductionTestModeDisabled(environment: Environment = process.env): void {
  if (environment.NODE_ENV === 'production' &&
      (environment.TEST_MODE === '1' || environment.NEXT_PUBLIC_TEST_MODE === '1')) {
    throw new Error('Test mode flags must be disabled in production and preview builds.')
  }
}
