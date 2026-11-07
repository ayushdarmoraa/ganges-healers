import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/unit/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Pure unit tests never load credentials or reset/seed a database.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/tests/setup.network-guard.ts'],
  // Move ts-jest config out of deprecated globals into transform
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  testTimeout: 30000,
  verbose: true,
}
export default config
