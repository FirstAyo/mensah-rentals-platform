import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await expect
    .poll(
      async () => {
        try {
          return (await request.get('http://localhost:4000/health')).status();
        } catch {
          return 0;
        }
      },
      {
        message: 'The API should be ready before public catalogue tests begin',
        timeout: 30_000,
      },
    )
    .toBe(200);
});

test('catalogue reflows without horizontal overflow and passes serious accessibility checks', async ({
  page,
}) => {
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

test('keyboard users can reach the skip link and catalogue controls', async ({
  page,
}) => {
  await page.goto('/rentals');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByLabel('Search equipment')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply filters' }),
  ).toBeVisible();
});

test('combined filters update the URL and remain server-backed', async ({
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
  await expect(
    page.getByRole('heading', { name: 'Results for "chair"' }),
  ).toBeVisible();
});

test('manual theme choice persists after reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  const toggle = page.getByRole('button', { name: /switch to dark theme/i });
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(
    page.getByRole('button', { name: /switch to light theme/i }),
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

test('product detail has a labelled media region and no public stock claims', async ({
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
  await expect(
    page.getByRole('region', { name: /image gallery/i }),
  ).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(
    /only \d+ left|\d+ (available|remaining)|total quantity/i,
  );
  expect(text).not.toMatch(/asset number|serial number|reserved quantity/i);
});

test('guest rental cart reflows and passes serious accessibility checks', async ({
  page,
}) => {
  await page.goto('/cart');
  await expect(
    page.getByRole('heading', { name: /equipment your project needs/i }),
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

test('guest cart persists desired quantity without stock or reservation claims', async ({
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
  await expect(
    page.getByText(/quantity saved in your rental cart/i),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Rental cart, 1 equipment type' }),
  ).toBeVisible();
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

test('guest rental request page reflows and passes serious accessibility checks', async ({
  page,
}) => {
  await page.goto('/rental-request');
  await expect(
    page.getByRole('heading', { name: /tell us about your project/i }),
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

test('a guest submits and privately tracks the original desired quantity', async ({
  browser,
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
    .getByRole('link', { name: /rental cart, 1 equipment type/i })
    .click();
  await page.getByRole('link', { name: 'Continue to rental request' }).click();

  await page.getByLabel('First name').fill('Ama');
  await page.getByLabel('Last name').fill('Mensah');
  await page.getByLabel('Email').fill('ama@example.test');
  await page.getByLabel('Phone').fill('+233 20 123 4567');
  await page.getByLabel('Project or event name').fill('Playwright event');
  await page.getByLabel('Project or event type').fill('Event');
  await page.getByLabel('Rental start date').fill('2026-08-01');
  await page.getByLabel('Rental end date').fill('2026-08-03');
  await page.getByLabel('Project or event location').fill('Accra');
  await page.getByRole('button', { name: 'Review request' }).click();
  await expect(page.getByText('100 each', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Submit rental request' }).click();

  await expect(page).toHaveURL(/\/rental-requests\/MR-\d{4}-/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Request submitted' }),
  ).toBeVisible();
  await expect(
    page.getByText(/not an approval, reservation, or final quote/i),
  ).toBeVisible();
  await expect(page.getByText(/100 each/i)).toBeVisible();
  const reference = (await page.getByText(/Reference:/).innerText())
    .replace('Reference:', '')
    .trim();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Request submitted' }),
  ).toBeVisible();

  const privateContext = await browser.newContext();
  const privatePage = await privateContext.newPage();
  await privatePage.goto(`http://localhost:3000/rental-requests/${reference}`);
  await expect(
    privatePage.getByRole('heading', { name: 'Request not available' }),
  ).toBeVisible();
  await privateContext.close();

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(
    /available quantity|remaining quantity|stock count|price|staff note/i,
  );
});
