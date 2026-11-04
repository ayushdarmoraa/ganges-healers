// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS launcher must run before any application imports.
const { spawnSync } = require('node:child_process')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone CommonJS launcher uses Node's path utilities.
const path = require('node:path')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS launcher converts the loader path to a portable import URL.
const { pathToFileURL } = require('node:url')

const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, path.join(__dirname, 'test-database.ts'), 'e2e'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_MODE: '1' },
})
process.exitCode = result.status ?? 1
