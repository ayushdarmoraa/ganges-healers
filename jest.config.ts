import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Load env early and common jest setup after env
  setupFiles: ['<rootDir>/tests/jest.env.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/tests/setup.network-guard.ts'],
  // Move ts-jest config out of deprecated globals into transform
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json', isolatedModules: true }],
  },
  testTimeout: 30000,
  verbose: true,
  // Ensure DB schema is ready for integration tests
  globalSetup: '<rootDir>/tests/jest.global-setup.ts',
}
export default config
