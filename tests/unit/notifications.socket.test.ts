import { spawnSync } from 'node:child_process'
import path from 'node:path'

test('real sessions isolate socket rooms, reject forged/foreign requests, and expire connections', () => {
  const result = spawnSync(process.execPath, ['--import', require.resolve('tsx'), path.join(process.cwd(), 'tests/fixtures/notification-socket.fixture.ts')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AUTH_SECRET: 'notification-socket-synthetic-test-secret', NEXTAUTH_SECRET: '' },
  })
  if (result.error || result.status !== 0) throw new Error(`Socket test failed: ${result.error?.message || result.stderr || result.stdout}`)
  expect(result.stdout).toContain('notification socket checks passed')
})
