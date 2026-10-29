import { test, expect } from '@playwright/test';

// Basic admin payments analytics smoke test
// Assumptions: seeded admin user credentials (email/password) exist.
// If password auth not configured for admin in test env, this test can be adapted to programmatic session injection.

// In TEST_MODE the RBAC check auto-allows admin, so we can skip authentication flows.

test.describe('Admin Payments Dashboard', () => {
  test('shows KPIs, charts and filters react', async ({ page }) => {
    // Allow extra time – underlying analytics queries intentionally slow-ish in test env
    test.setTimeout(120000);
    await page.goto('/admin/payments');

    // The dashboard is a lazy client chunk; cold dev compilation can take time.
    const root = page.locator('[data-test="payments-analytics-root"]');
    await expect(root).toBeVisible({ timeout: 30000 });

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
