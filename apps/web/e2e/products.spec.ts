import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

process.loadEnvFile(resolve(process.cwd(), '../../.env'));

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for product browser tests.`);
  return value;
}

async function login(
  page: Page,
  email = required('STAFF_BOOTSTRAP_EMAIL'),
  password = required('STAFF_BOOTSTRAP_PASSWORD'),
) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

async function findProductRow(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Search' }).fill(name);
  const row = page.locator('tbody tr').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

test('@products permanently deletes an unreferenced product accessibly at 320px', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const productName = required('PHASE16_3_DISPOSABLE_PRODUCT_NAME');
  await login(page);
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await page.goto('http://localhost:3001/products');
  const row = await findProductRow(page, productName);
  await row.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this product?');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .include('dialog')
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Delete product' }).click();
  await expect(page.getByText(`${productName} was deleted.`)).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: productName }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('@products edits product identity and category, then preserves history through tombstone deletion', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const originalName = required('PHASE16_3_REFERENCED_PRODUCT_NAME');
  const duplicateSlug = required('PHASE16_3_DUPLICATE_PRODUCT_SLUG');
  const targetCategory = required('PHASE16_3_TARGET_CATEGORY_NAME');
  const targetCategorySlug = required('PHASE16_3_TARGET_CATEGORY_SLUG');
  const requestReference = required('PHASE16_3_REQUEST_REFERENCE');
  const updatedName = `${originalName} updated`;
  const updatedSlug = `phase-16-3-updated-${Date.now()}`;
  await login(page);
  await page.goto('http://localhost:3001/products');
  let row = await findProductRow(page, originalName);
  await row.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill(updatedName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL('http://localhost:3001/products');

  row = await findProductRow(page, updatedName);
  await row.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Slug').fill(duplicateSlug);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByText('That product slug is already in use.'),
  ).toBeVisible();
  await page.getByLabel('Slug').fill(`  ${updatedSlug.toUpperCase()}  `);
  await page.getByLabel('Category').selectOption({ label: targetCategory });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL('http://localhost:3001/products');

  row = await findProductRow(page, updatedName);
  await expect(row).toContainText(`/${updatedSlug}`);
  const deleteButton = row.getByRole('button', { name: 'Delete' });
  await deleteButton.click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete product from catalogue?');
  await expect(dialog).toContainText('required history will be preserved');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete product' }).click();
  await expect(page.getByText(`${updatedName} was deleted.`)).toBeVisible();
  await expect(
    page.locator('tbody tr').filter({ hasText: updatedName }),
  ).toHaveCount(0);

  const publicProduct = await page.request.get(
    `http://localhost:4000/public/products/${targetCategorySlug}/${updatedSlug}`,
  );
  expect(publicProduct.status()).toBe(404);
  await page.goto('http://localhost:3001/rental-requests');
  await page.getByLabel('Search requests').fill(requestReference);
  await page.getByRole('link', { name: requestReference }).click();
  await expect(page.getByText(originalName, { exact: true })).toBeVisible();
});

test('@products hides permanent deletion from the default editor role', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  await login(
    page,
    required('PHASE16_3_EDITOR_EMAIL'),
    required('PHASE16_3_EDITOR_PASSWORD'),
  );
  await page.goto('http://localhost:3001/products');
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Edit' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});
