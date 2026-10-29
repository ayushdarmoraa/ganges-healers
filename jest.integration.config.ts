import type { Config } from 'jest'
import base from './jest.config'

const config: Config = {
  ...base,
  testMatch: ['**/tests/integration/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/jest.env.setup.ts'],
  globalSetup: '<rootDir>/tests/jest.global-setup.ts',
}

export default config
