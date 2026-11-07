import { runTestDatabaseCommand } from '../scripts/test-database'
import { seedIntegrationMinimal } from './jest.seed.integration'

async function globalSetup() {
  try {
    // Identity check runs in a separate process before reset/client generation.
    const settings = runTestDatabaseCommand('reset')
    Object.assign(process.env, settings.environment)
    // Seed minimal fixtures needed for integration tests
    await seedIntegrationMinimal()
  } catch {
    throw new Error('Integration database preparation failed; verify the dedicated test configuration.')
  }
}

export default globalSetup
