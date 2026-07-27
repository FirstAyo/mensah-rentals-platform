import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('@cart cart reflows in light and dark modes', async ({
  page,
}, testInfo) => {
  test.skip(!['mobile-320', 'desktop-1024'].includes(testInfo.project.name));
  await page.goto('/cart');
  await expect(
    page.getByRole('heading', { name: /equipment your project needs/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  for (const mode of ['light', 'dark'] as const) {
    const isDark = await page
      .locator('html')
      .evaluate((node) => node.classList.contains('dark'));
    if ((mode === 'dark') !== isDark)
      await page
        .getByRole('button', { name: /switch to (dark|light) theme/i })
        .click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  }
});

test('@cart guest cart persists quantity 100 without stock claims', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  const productHref = await page
    .locator('article a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(productHref).toBeTruthy();
  await page.goto(productHref!);
  await page.getByLabel('Desired quantity').fill('100');
  await page.getByRole('button', { name: 'Add to rental cart' }).click();
  await page
    .getByRole('link', { name: 'Rental cart, 1 equipment type' })
    .click();
  await expect(page.getByText('100', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('100', { exact: true })).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/only \d+ left|\d+ available|remaining quantity/i);
  expect(text).toContain('does not reserve equipment');
});
