import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('@requests request page reflows in light and dark modes', async ({
  page,
}, testInfo) => {
  test.skip(!['mobile-320', 'desktop-1024'].includes(testInfo.project.name));
  await page.goto('/rental-request');
  await expect(
    page.getByRole('heading', { name: /tell us about your project/i }),
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

test('@requests guest submits and privately tracks original quantity', async ({
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
  expect(await page.locator('body').innerText()).not.toMatch(
    /available quantity|remaining quantity|stock count|price|staff note/i,
  );
});
