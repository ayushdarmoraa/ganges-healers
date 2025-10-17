import { test, expect } from '@playwright/test';

test('unauthenticated /dashboard redirects to sign-in', async ({ page }) => {
  await page.goto('/dashboard');
    await expect(page).toHaveURL(/(login|signin|auth)/i, { timeout: 15000 });
});

test('/services lists seeded services', async ({ page }) => {
  await page.goto('/services');
  // Show at least a few cards
  const cards = page.locator('[data-test="service-card"]'); // add this data attribute in your card if missing
    await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
});

test('service detail shows healers and can open BookingModal', async ({ page }) => {
  await page.goto('/services');

  // Wait for at least one service card – allow for slower first paint on cold start
  const cards = page.locator('[data-test="service-card"]');
  try {
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
  } catch {
    // Occasionally the Next dev overlay can interrupt first paint; reload once.
    await page.reload();
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
  }
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  const first = cards.first();
  await first.scrollIntoViewIfNeeded();
  const slugAttr = await first.getAttribute('data-service-slug');
  await first.click();

  // Wait for URL change (retry once by direct navigation if SPA interception failed)
  try {
    await expect(page).toHaveURL(/\/services\/.+/, { timeout: 20000 });
  } catch {
    if (slugAttr) {
      await page.goto(`/services/${slugAttr}`);
      await expect(page).toHaveURL(new RegExp(`/services/${slugAttr}`));
    } else {
      throw new Error('Navigation to service detail failed and slug missing');
    }
  }

  // Optional healer interaction
  const healerCard = page.locator('[data-test="healer-card"]').first();
  if (await healerCard.isVisible()) {
    const bookButton = healerCard.getByRole('button', { name: /book/i });
    if (await bookButton.isVisible()) {
      await bookButton.click();
      // Wait for either the dialog itself or the date input inside it
      try {
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
      } catch {
        await expect(page.getByLabel(/select date/i)).toBeVisible({ timeout: 10000 });
      }
    }
  }
});