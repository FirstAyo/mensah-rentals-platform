import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

process.loadEnvFile(resolve(process.cwd(), '../../.env'));

function staffCredential(
  name: 'STAFF_BOOTSTRAP_EMAIL' | 'STAFF_BOOTSTRAP_PASSWORD',
) {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is required in the ignored root .env for authenticated admin browser tests.`,
    );
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page
    .getByLabel(/email/i)
    .fill(staffCredential('STAFF_BOOTSTRAP_EMAIL'));
  await page
    .getByLabel(/password/i)
    .fill(staffCredential('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

test('@admin-requests authenticated review workflow remains non-decision and non-reserving', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await login(page);
  await page.goto('http://localhost:3001/rental-requests');
  await expect(
    page.getByRole('heading', { name: 'Rental requests' }),
  ).toBeVisible();
  await page.getByLabel('Status').selectOption('SUBMITTED');
  const requestLink = page.locator('table tbody a').first();
  await expect(requestLink).toBeVisible();
  const reference = (await requestLink.textContent())?.trim();
  await page.getByLabel('Search requests').fill(reference ?? 'MR-');
  await expect(requestLink).toContainText(reference ?? 'MR-');
  await requestLink.click();

  await expect(
    page.getByRole('heading', { name: 'Requested items' }),
  ).toBeVisible();
  await expect(
    page.getByText(/requested quantities.*permanent/i),
  ).toBeVisible();
  await expect(
    page.getByText(/does not reserve or change inventory/i).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /approve|reject/i }),
  ).toHaveCount(0);

  const assignment = page.getByLabel('Assigned staff');
  const current = await assignment.inputValue();
  const choices = await assignment.locator('option').evaluateAll((options) =>
    options.map((option) => ({
      value: (option as HTMLOptionElement).value,
    })),
  );
  const next = choices.find(({ value }) => value && value !== current)?.value;
  await assignment.selectOption(next ?? '');
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText(/assigned|unassigned/i).last()).toBeVisible();

  const note = `Phase 9 browser verification ${Date.now()}`;
  await page.getByLabel('Add an internal note').fill(note);
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(note)).toBeVisible();

  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('Under Review').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(
    0,
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('@admin-requests queue and detail do not overflow at 320px in dark mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await login(page);
  await page.goto('http://localhost:3001/rental-requests');
  await expect(
    page.getByRole('heading', { name: 'Rental requests' }),
  ).toBeVisible();
  const isDark = await page
    .locator('html')
    .evaluate((node) => node.classList.contains('dark'));
  if (!isDark)
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const detailLink = page
    .locator('article a[href^="/rental-requests/"]')
    .first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
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
