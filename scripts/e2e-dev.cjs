/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Explicitly load .env.test so Next dev doesn't fall back to production .env DATABASE_URL
try {
  process.env.TEST_MODE = '1'
  console.log('[e2e-dev] TEST_MODE=1 enabled')
  const testEnvPath = path.join(process.cwd(), '.env.test');
  if (fs.existsSync(testEnvPath)) {
  require('dotenv').config({ path: testEnvPath });
    console.log('[e2e-dev] loaded .env.test');
  } else {
    console.warn('[e2e-dev] .env.test not found – using existing env');
  }
} catch (e) {
  console.warn('[e2e-dev] failed loading .env.test', e);
}
console.log('[e2e-dev] DATABASE_URL =', process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0,50)+'...' : 'undefined');

function run(cmd) {
  console.log(`[e2e-dev] running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

try {
  console.log('[e2e-dev] resetting schema');
  run('prisma db push --force-reset');
  console.log('[e2e-dev] seeding database');
  run('tsx prisma/seed.ts');
  console.log('[e2e-dev] starting Next dev server');
  // Use standard dev (not turbopack) for faster reliable cold start in CI
  run('next dev');
} catch (e) {
  console.error('[e2e-dev] failed', e);
  process.exit(1);
}
