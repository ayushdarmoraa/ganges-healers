import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parse } from 'dotenv'

const TEST_DATABASE_NAME = 'ganges_healers_test'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const PRODUCTION_ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local']

interface TestDatabaseSettings {
  rootDir: string
  hostname: string
  databaseName: string
  environment: NodeJS.ProcessEnv
}

/** Load an explicit test target without allowing inherited production settings to win. */
export function loadTestDatabaseEnvironment(options: {
  rootDir?: string
  environment?: Record<string, string | undefined>
} = {}): TestDatabaseSettings {
  const rootDir = options.rootDir ?? process.cwd()
  const inherited = options.environment ?? process.env
  if (inherited.NODE_ENV === 'production') {
    throw new Error('Test database commands are disabled in production.')
  }

  const testFile = path.join(rootDir, '.env.test')
  let fileEnvironment: Record<string, string> = {}
  if (existsSync(testFile)) {
    const source = readFileSync(testFile, 'utf8')
    const definitions = source.match(/^\s*(?:export\s+)?DATABASE_URL\s*=/gm) ?? []
    if (definitions.length !== 1) {
      throw new Error('.env.test must contain exactly one active DATABASE_URL.')
    }
    fileEnvironment = parse(source)
  } else if (inherited.CI !== 'true') {
    throw new Error('Missing .env.test; refusing to use an inherited database URL.')
  }

  if (fileEnvironment.NODE_ENV === 'production') {
    throw new Error('The test environment cannot enable production mode.')
  }
  const environment: NodeJS.ProcessEnv = { ...inherited, ...fileEnvironment, NODE_ENV: 'test' }
  let target: URL
  try {
    target = new URL(environment.DATABASE_URL ?? '')
    if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error()
  } catch {
    throw new Error('A valid PostgreSQL test DATABASE_URL is required.')
  }

  let databaseName: string
  try {
    databaseName = decodeURIComponent(target.pathname.slice(1))
  } catch {
    throw new Error('Invalid test database name.')
  }
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(`Test commands require the ${TEST_DATABASE_NAME} database.`)
  }
  if (target.hostname.toLowerCase().includes('-pooler.')) {
    throw new Error('Test setup requires a direct PostgreSQL connection, with pooling disabled.')
  }
  const routingParameters = new Set(['host', 'hostaddr', 'port', 'dbname', 'database', 'user', 'password', 'service'])
  for (const key of target.searchParams.keys()) {
    if (routingParameters.has(key.toLowerCase())) {
      throw new Error('Database routing overrides are not allowed in a test URL.')
    }
  }

  const hostname = target.hostname.toLowerCase()
  const configuredHost = environment.TEST_DATABASE_HOST?.trim().toLowerCase()
  const ciLoopback = inherited.CI === 'true' && LOOPBACK_HOSTS.has(hostname)
  if ((!configuredHost && !ciLoopback) || (configuredHost && configuredHost !== hostname)) {
    throw new Error('Set TEST_DATABASE_HOST to the dedicated test hostname in .env.test.')
  }
  if (!existsSync(testFile) && !ciLoopback) {
    throw new Error('CI without .env.test may use only an isolated loopback test database.')
  }

  for (const filename of PRODUCTION_ENV_FILES) {
    const file = path.join(rootDir, filename)
    if (!existsSync(file)) continue
    const productionUrl = parse(readFileSync(file, 'utf8')).DATABASE_URL
    if (!productionUrl) continue
    let production: URL
    try {
      production = new URL(productionUrl)
    } catch {
      throw new Error(`Cannot validate database separation against ${filename}.`)
    }
    if (production.hostname.toLowerCase() === hostname) {
      throw new Error('The test hostname must differ from the production database hostname.')
    }
  }

  return { rootDir, hostname, databaseName, environment }
}

/** Reject a misrouted connection before any reset or seed operation. */
export function assertTestDatabaseIdentity(expected: string, actual: string) {
  if (expected !== TEST_DATABASE_NAME || actual !== expected) {
    throw new Error('Connected database identity does not match the dedicated test database.')
  }
}

/** Connect with the validated URL, perform only an identity read, and always disconnect. */
export async function verifyTestDatabaseConnection(settings: TestDatabaseSettings) {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: { db: { url: settings.environment.DATABASE_URL } },
    log: [],
  })
  try {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
    assertTestDatabaseIdentity(settings.databaseName, rows[0]?.name ?? '')
  } finally {
    await prisma.$disconnect()
  }
}

function runChecked(settings: TestDatabaseSettings, args: string[], label: string) {
  // Capture subprocess output: database tools and seed scripts may print credentials.
  const result = spawnSync(process.execPath, args, {
    cwd: settings.rootDir,
    env: settings.environment,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Test database ${label} failed. No connection credentials were logged.`)
  }
  console.log(`[test-db] ${label} complete`)
}

/** Verify identity in a short-lived process before Prisma can lock its Windows DLL. */
export function runTestDatabaseCommand(action: 'reset' | 'seed' | 'prepare') {
  const settings = loadTestDatabaseEnvironment()
  const requireFromProject = createRequire(path.join(settings.rootDir, 'package.json'))
  const loader = pathToFileURL(requireFromProject.resolve('tsx')).href
  runChecked(settings, ['--import', loader, __filename, 'identity'], 'identity check')

  if (action === 'reset' || action === 'prepare') {
    const prismaCli = path.join(path.dirname(requireFromProject.resolve('prisma/package.json')), 'build', 'index.js')
    runChecked(settings, [prismaCli, 'db', 'push', '--force-reset'], 'schema reset')
  }
  if (action === 'seed' || action === 'prepare') {
    runChecked(settings, ['--import', loader, path.join(settings.rootDir, 'prisma', 'seed.ts')], 'seed')
  }
  return settings
}

async function main() {
  const action = process.argv[2]
  if (action === 'identity') {
    await verifyTestDatabaseConnection(loadTestDatabaseEnvironment())
  } else if (action === 'reset' || action === 'seed' || action === 'prepare') {
    runTestDatabaseCommand(action)
  } else if (action === 'e2e') {
    const settings = runTestDatabaseCommand('prepare')
    const requireFromProject = createRequire(path.join(settings.rootDir, 'package.json'))
    const nextCli = requireFromProject.resolve('next/dist/bin/next')
    const result = spawnSync(process.execPath, [nextCli, 'dev', '-p', '3010'], {
      cwd: settings.rootDir,
      env: { ...settings.environment, NODE_ENV: 'development', TEST_MODE: '1' },
      stdio: 'inherit',
    })
    process.exitCode = result.status ?? 1
  } else {
    throw new Error('Expected a test database action: reset, seed, prepare, or e2e.')
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('[test-db] Operation refused or failed; verify the dedicated test configuration and connectivity.')
    process.exitCode = 1
  })
}
