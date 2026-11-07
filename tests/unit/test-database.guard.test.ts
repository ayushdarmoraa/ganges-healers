import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedIntegrationMinimal } from '../jest.seed.integration'
import {
  loadTestDatabaseEnvironment,
  assertTestDatabaseIdentity,
  verifyTestDatabaseConnection,
} from '../../scripts/test-database'

jest.mock('@prisma/client', () => {
  const client = {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
    service: { upsert: jest.fn() },
    user: { upsert: jest.fn() },
    healer: { upsert: jest.fn() },
    membershipPlan: { upsert: jest.fn() },
  }
  return { PrismaClient: jest.fn(() => client), testClient: client }
})

const { PrismaClient, testClient } = jest.requireMock<{
  PrismaClient: jest.Mock
  testClient: {
    $queryRaw: jest.Mock
    $disconnect: jest.Mock
    service: { upsert: jest.Mock }
    user: { upsert: jest.Mock }
    healer: { upsert: jest.Mock }
    membershipPlan: { upsert: jest.Mock }
  }
}>('@prisma/client')

describe('dedicated test database guard', () => {
  let rootDir: string
  const testUrl = 'postgresql://user:fake-password@test.example/ganges_healers_test?sslmode=require'
  const environment = { NODE_ENV: 'test' }

  function writeTestFile(source = `DATABASE_URL="${testUrl}"\nTEST_DATABASE_HOST=test.example\n`) {
    writeFileSync(path.join(rootDir, '.env.test'), source)
  }

  function load(overrides: Record<string, string | undefined> = {}) {
    return loadTestDatabaseEnvironment({ rootDir, environment: { ...environment, ...overrides } })
  }

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'ganges-db-guard-'))
    jest.clearAllMocks()
    testClient.$queryRaw.mockResolvedValue([{ name: 'ganges_healers_test' }])
    testClient.$disconnect.mockResolvedValue(undefined)
    testClient.service.upsert.mockResolvedValue({ id: 'test-service' })
    testClient.user.upsert.mockResolvedValue({ id: 'test-healer-user' })
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('refuses a missing test file rather than using an inherited URL', () => {
    expect(() => load({ DATABASE_URL: testUrl })).toThrow('Missing .env.test')
  })

  test('explicit test-file values override inherited production settings', () => {
    writeTestFile()
    const settings = load({ DATABASE_URL: 'postgresql://user:unused@production.example/production' })
    expect(settings.environment.DATABASE_URL).toBe(testUrl)
    expect(settings.hostname).toBe('test.example')
    expect(settings.databaseName).toBe('ganges_healers_test')
  })

  test.each(['', 'DATABASE_URL=x\nDATABASE_URL=y\n'])('rejects missing or duplicate definitions', source => {
    writeTestFile(source)
    expect(() => load()).toThrow('exactly one active DATABASE_URL')
  })

  test('ignores commented-out URL definitions', () => {
    writeTestFile(`# DATABASE_URL=ignored\nDATABASE_URL=${testUrl}\nTEST_DATABASE_HOST=test.example\n`)
    expect(load().environment.DATABASE_URL).toBe(testUrl)
  })

  test.each(['NODE_ENV=production\n', ''])('blocks production runtime even with a valid test URL', extra => {
    writeTestFile(`DATABASE_URL=${testUrl}\nTEST_DATABASE_HOST=test.example\n${extra}`)
    expect(() => load({ NODE_ENV: 'production' })).toThrow('disabled in production')
  })

  test('rejects production mode inside the test file', () => {
    writeTestFile(`DATABASE_URL=${testUrl}\nTEST_DATABASE_HOST=test.example\nNODE_ENV=production\n`)
    expect(() => load()).toThrow('cannot enable production')
  })

  test.each([
    ['wrong database', 'postgresql://user:unused@test.example/neondb', 'require the ganges_healers_test'],
    ['pooling', 'postgresql://user:unused@test-pooler.example/ganges_healers_test', 'pooling disabled'],
    ['protocol', 'https://test.example/ganges_healers_test', 'valid PostgreSQL'],
    ['routing override', `${testUrl}&host=production.example`, 'routing overrides'],
  ])('rejects %s without exposing credentials', (_label, url, message) => {
    writeTestFile(`DATABASE_URL=${url}\nTEST_DATABASE_HOST=test.example\n`)
    expect(() => load()).toThrow(message)
    try { load() } catch (error) {
      expect((error as Error).message).not.toContain('fake-password')
      expect((error as Error).message).not.toContain(url)
    }
  })

  test.each(['', 'TEST_DATABASE_HOST=wrong.example\n'])('requires a matching dedicated host', host => {
    writeTestFile(`DATABASE_URL=${testUrl}\n${host}`)
    expect(() => load()).toThrow('TEST_DATABASE_HOST')
  })

  test.each(['.env', '.env.local', '.env.production', '.env.production.local'])('rejects the production host from %s', filename => {
    writeTestFile()
    writeFileSync(path.join(rootDir, filename), 'DATABASE_URL=postgresql://user:unused@test.example/production\n')
    expect(() => load()).toThrow('must differ from the production')
  })

  test('allows CI to use its isolated loopback PostgreSQL without a private file', () => {
    const settings = load({ CI: 'true', DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ganges_healers_test' })
    expect(settings.hostname).toBe('localhost')
  })

  test('does not let CI inherit a remote target without a private test file', () => {
    expect(() => load({ CI: 'true', DATABASE_URL: testUrl, TEST_DATABASE_HOST: 'test.example' })).toThrow('only an isolated loopback')
  })

  test('rejects an actual connection to a differently named database', () => {
    expect(() => assertTestDatabaseIdentity('ganges_healers_test', 'neondb')).toThrow('identity does not match')
  })

  test('binds the identity probe to the validated URL and closes its client', async () => {
    writeTestFile()
    await verifyTestDatabaseConnection(load())
    expect(PrismaClient).toHaveBeenCalledWith({ datasources: { db: { url: testUrl } }, log: [] })
    expect(testClient.$queryRaw).toHaveBeenCalledTimes(1)
    expect(testClient.$disconnect).toHaveBeenCalledTimes(1)
  })

  test('closes the identity probe client when identity validation fails', async () => {
    writeTestFile()
    testClient.$queryRaw.mockResolvedValue([{ name: 'neondb' }])
    await expect(verifyTestDatabaseConnection(load())).rejects.toThrow('identity does not match')
    expect(testClient.$disconnect).toHaveBeenCalledTimes(1)
  })

  test('closes the identity probe client when the connection fails', async () => {
    writeTestFile()
    testClient.$queryRaw.mockRejectedValue(new Error('connection failed'))
    await expect(verifyTestDatabaseConnection(load())).rejects.toThrow('connection failed')
    expect(testClient.$disconnect).toHaveBeenCalledTimes(1)
  })

  test('closes the separate integration seed client on success', async () => {
    await expect(seedIntegrationMinimal()).resolves.toEqual({ serviceId: 'test-service' })
    expect(testClient.$disconnect).toHaveBeenCalledTimes(1)
  })

  test('closes the separate integration seed client on failure', async () => {
    testClient.service.upsert.mockRejectedValue(new Error('seed failed'))
    await expect(seedIntegrationMinimal()).rejects.toThrow('seed failed')
    expect(testClient.$disconnect).toHaveBeenCalledTimes(1)
  })
})
