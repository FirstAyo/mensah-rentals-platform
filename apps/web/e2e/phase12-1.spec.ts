import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

function credential(
  name: 'STAFF_BOOTSTRAP_EMAIL' | 'STAFF_BOOTSTRAP_PASSWORD',
) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from the isolated harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(credential('STAFF_BOOTSTRAP_EMAIL'));
  await page
    .getByLabel(/password/i)
    .fill(credential('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((entry) =>
      ['critical', 'serious'].includes(entry.impact ?? ''),
    ),
  ).toEqual([]);
}

test('@phase12-1 admin shell is edge-aligned, responsive, themed, and accessible', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  await login(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await axe(page);
});

test('@phase12-1 badge and dashboard follow actionable source records on ultrawide screens', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'ultrawide-2560');
  const reference = 'MR-2026-P121E2ETST';
  await login(page);

  const sidebar = page.locator('aside');
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())?.x).toBe(0);
  await expect(
    sidebar.getByLabel(/1 submitted rental request awaiting review/i),
  ).toBeVisible();
  const submittedCard = page
    .getByText('Submitted awaiting review', { exact: true })
    .locator('../..');
  await expect(submittedCard.getByText('1', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await sidebar.getByRole('link', { name: /Rental Requests/ }).click();
  await page.getByLabel('Search requests').fill(reference);
  await page.getByRole('link', { name: reference, exact: true }).click();
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(
    sidebar.getByLabel(/submitted rental request awaiting review/i),
  ).toHaveCount(0);
  await page.goto('http://localhost:3001/');
  await expect(
    page
      .getByText('Submitted awaiting review', { exact: true })
      .locator('../..')
      .getByText('0', { exact: true }),
  ).toBeVisible();
  await axe(page);
});
