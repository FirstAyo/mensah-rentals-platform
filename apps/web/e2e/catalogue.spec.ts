import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const responsiveProjects = new Set(['mobile-320', 'tablet-768', 'wide-1440']);

test('@catalogue catalogue reflows and passes light accessibility checks', async ({
  page,
}, testInfo) => {
  test.skip(!responsiveProjects.has(testInfo.project.name));
  await page.goto('/rentals');
  await expect(
    page.getByRole('heading', { name: /equipment for events/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('@catalogue 320px catalogue remains accessible in dark mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await page.goto('/rentals');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('@catalogue keyboard users reach the skip link and controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByLabel('Search equipment')).toBeVisible();
});

test('@catalogue combined filters remain server-backed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.getByLabel('Search equipment').fill('chair');
  await page.getByLabel('Sort by').selectOption('name-desc');
  await page.getByLabel('Featured only').check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/search=chair/);
  await expect(page).toHaveURL(/featured=true/);
  await expect(page).toHaveURL(/sort=name-desc/);
});

test('@catalogue manual theme persists and product details expose no stock claims', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const productHref = await page
    .locator('article a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(productHref).toBeTruthy();
  await page.goto(productHref!);
  await expect(
    page.getByRole('region', { name: /image gallery/i }),
  ).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(
    /only \d+ left|\d+ (available|remaining)|total quantity|asset number|serial number|reserved quantity/i,
  );
});
