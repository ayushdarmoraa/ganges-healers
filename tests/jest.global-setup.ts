import { execSync } from 'node:child_process'
import { seedIntegrationMinimal } from './jest.seed.integration'

async function globalSetup() {
  try {
    // Prepare database schema for tests. Uses DATABASE_URL from .env.test
    execSync('npx prisma db push --force-reset', { stdio: 'inherit' })
    // Seed minimal fixtures needed for integration tests
    await seedIntegrationMinimal()
  } catch (e) {
    // Surface but do not hide stack
    console.error('[jest][global-setup][db-push-failed]', e)
    throw e
  }
}

export default globalSetup
