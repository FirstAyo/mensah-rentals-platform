import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('@admin unauthenticated admin remains protected and accessible', async ({
  page,
}, testInfo) => {
  test.skip(!['mobile-320', 'desktop-1024'].includes(testInfo.project.name));
  await page.goto('http://localhost:3001/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: /mensah rentals admin/i }),
  ).toBeVisible();
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
