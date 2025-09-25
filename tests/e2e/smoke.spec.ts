import { test, expect } from '@playwright/test';

test('unauthenticated /dashboard redirects to sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/(login|signin|auth)/i);
});

test('/services lists seeded services', async ({ page }) => {
  await page.goto('/services');
  // Show at least a few cards
  const cards = page.locator('[data-test="service-card"]'); // add this data attribute in your card if missing
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(3);
});

test('service detail shows healers and can open BookingModal', async ({ page }) => {
  await page.goto('/services');
  
  // Wait for service cards to load
  const cards = page.locator('[data-test="service-card"]');
  await expect(cards.first()).toBeVisible();
  
  // Get the first service card and click it
  const first = cards.first();
  await expect(first).toBeVisible();
  
  // Navigate to service detail
  
  await first.click();
  await page.waitForLoadState('networkidle');

  // Wait for navigation to service detail page
  await expect(page).toHaveURL(/\/services\/.+/);

  // At least one healer card
  const healerCard = page.locator('[data-test="healer-card"]').first();
  await expect(healerCard).toBeVisible();

  // Open booking modal
  await healerCard.getByRole('button', { name: /book/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});