import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/components/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Next.js module shims
    '^next/router$': '<rootDir>/tests/mocks/next-router.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.ui.setup.ts'],
  transform: { 
    '^.+\\.(t|j)sx?$': ['ts-jest', { 
      tsconfig: 'tsconfig.test.json',
      isolatedModules: true
    }] 
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ]
};

export default config;