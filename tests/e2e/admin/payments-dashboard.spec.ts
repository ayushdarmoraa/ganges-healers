import { test, expect } from '@playwright/test';
import { Script } from 'node:vm';

// Basic admin payments analytics smoke test
// Assumptions: seeded admin user credentials (email/password) exist.
// If password auth not configured for admin in test env, this test can be adapted to programmatic session injection.

// In TEST_MODE the RBAC check auto-allows admin, so we can skip authentication flows.

test.describe('Admin Payments Dashboard', () => {
  test('shows KPIs, charts and filters react', async ({ page }) => {
    // Cold client compilation and analytics queries have separate bounded budgets.
    test.setTimeout(180000);
    const clientErrors: string[] = [];
    const failedScripts: string[] = [];
    const parseFailures: { url: string; source: string; syntax: string }[] = [];
    const captures: Promise<void>[] = [];
    const debuggerSession = await page.context().newCDPSession(page);
    debuggerSession.on('Debugger.scriptFailedToParse', event => {
      if (captures.length >= 5) return;
      captures.push(debuggerSession.send('Debugger.getScriptSource', { scriptId: event.scriptId }).then(({ scriptSource }) => {
        let syntax = '';
        try { new Script(scriptSource); } catch (error) { syntax = error instanceof Error ? error.stack || error.message : String(error); }
        parseFailures.push({ url: event.url, source: scriptSource, syntax });
      }).catch(() => { failedScripts.push('failed-to-read-script-source'); }));
    });
    await debuggerSession.send('Debugger.enable');
    page.on('pageerror', error => { if (clientErrors.length < 5) clientErrors.push((error.stack || error.message).slice(0, 2000)); });
    page.on('requestfailed', request => {
      if (request.resourceType() === 'script' && failedScripts.length < 10) failedScripts.push(new URL(request.url()).pathname);
    });
    page.on('response', response => {
      if (response.request().resourceType() === 'script' && response.status() >= 400 && failedScripts.length < 10) {
        failedScripts.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
    const navigationStarted = Date.now();
    await page.goto('/admin/payments');
    const navigationMs = Date.now() - navigationStarted;

    // The dashboard is a lazy client chunk; cold dev compilation can take time.
    const root = page.locator('[data-test="payments-analytics-root"]');
    const mountStarted = Date.now();
    try {
      await expect(root).toBeVisible({ timeout: 60000 });
    } catch (error) {
      await Promise.allSettled(captures);
      for (const [index, failure] of parseFailures.entries()) {
        await test.info().attach(`failed-script-${index + 1}.js`, { body: failure.source, contentType: 'application/javascript' });
      }
      console.error('[e2e][payments][mount-failed]', {
        pathname: new URL(page.url()).pathname,
        loadingFallback: await page.getByText('Loading metrics...', { exact: true }).first().isVisible().catch(() => null),
        clientErrors,
        failedScripts,
        parseFailures: parseFailures.map(({ url, source, syntax }) => ({ url, bytes: Buffer.byteLength(source), syntax: syntax.slice(0, 2000) })),
      });
      throw error;
    } finally {
      await debuggerSession.detach();
    }
    console.log('[e2e][payments][mounted]', { navigationMs, clientMountMs: Date.now() - mountStarted });

    const kpiRow = page.locator('[data-test="kpi-row"]');
    await expect(kpiRow).toBeVisible();

    // Wait for final KPI cards (7) – polling until loading completes
    await expect(page.locator('[data-test="kpi-row"] > [data-test^="kpi-"]')).toHaveCount(7, { timeout: 60000 });

    // Charts
    await expect(page.locator('[data-test="chart-net"]')).toBeVisible();
    await expect(page.locator('[data-test="chart-by-type"]')).toBeVisible();

    // Filter interaction (SESSION -> ensure KPIs still present)
    const typeSelect = page.locator('[data-test="filter-type"]');
    await expect(typeSelect).toBeVisible();
    const filteredResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/payments/metrics' && url.searchParams.get('type') === 'SESSION';
    });
    await typeSelect.selectOption('SESSION');
    const response = await filteredResponse;
    expect(response.ok()).toBeTruthy();
    const filtered = await response.json();
    await expect(page.locator('[data-test="kpi-paymentsCount-value"]')).toHaveText(String(filtered.kpi.paymentsCount));

    // One of the tables (payments or refunds)
    const anyTable = page.locator('[data-test="table-payments"], [data-test="table-refunds"]');
    await expect(anyTable.first()).toBeVisible({ timeout: 30000 });
  });
});
