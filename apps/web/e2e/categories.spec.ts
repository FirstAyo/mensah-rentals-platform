import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

process.loadEnvFile(resolve(process.cwd(), '../../.env'));

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required for category browser tests.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

async function findCategoryRow(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Search' }).fill(name);
  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

test('@categories permanently deletes an empty category accessibly at 320px', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const categoryName = required('PHASE16_2_EMPTY_CATEGORY_NAME');
  await login(page);
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await page.goto('http://localhost:3001/categories');
  const row = await findCategoryRow(page, categoryName);
  const deleteButton = row.getByRole('button', { name: 'Delete' });
  await deleteButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this category?');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .include('dialog')
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByText(`${categoryName} was deleted.`)).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: categoryName }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('@categories edits a slug, confirms referenced deletion, and preserves request history', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const categoryName = required('PHASE16_2_HISTORY_CATEGORY_NAME');
  const productName = required('PHASE16_2_HISTORY_PRODUCT_NAME');
  const productSlug = required('PHASE16_2_HISTORY_PRODUCT_SLUG');
  const requestReference = required('PHASE16_2_REQUEST_REFERENCE');
  const updatedSlug = `phase-16-2-updated-${Date.now()}`;
  await login(page);
  await page.goto('http://localhost:3001/categories');
  let row = await findCategoryRow(page, categoryName);
  await row.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Slug').fill(`  ${updatedSlug.toUpperCase()}  `);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL('http://localhost:3001/categories');
  row = await findCategoryRow(page, categoryName);
  await expect(row).toContainText(`/${updatedSlug}`);

  const deleteButton = row.getByRole('button', { name: 'Delete' });
  await deleteButton.click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('contains 1 product');
  await expect(dialog).toContainText(
    'Historical rental, quote, order, inventory',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteButton).toBeFocused();
  await expect(row).toBeVisible();

  await deleteButton.click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Delete category and products' })
    .click();
  await expect(page.getByText(`${categoryName} was deleted.`)).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: categoryName }),
  ).toHaveCount(0);

  const publicProduct = await page.request.get(
    `http://localhost:4000/public/products/${updatedSlug}/${productSlug}`,
  );
  expect(publicProduct.status()).toBe(404);

  await page.goto('http://localhost:3001/rental-requests');
  await page.getByLabel('Search requests').fill(requestReference);
  await expect(
    page.getByRole('link', { name: requestReference }),
  ).toBeVisible();
  await page.getByRole('link', { name: requestReference }).click();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
});
