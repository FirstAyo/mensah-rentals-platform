import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 240_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the Phase 18.3 harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
}

async function expectAccessibleAndContained(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter(({ impact }) =>
      ['critical', 'serious'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function total(page: Page, inventoryId: string) {
  const response = await page.request.get(
    `http://localhost:3001/api/inventory/${inventoryId}/quantities`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as {
    states: Record<string, number>;
    totalQuantity: number;
  };
}

test('@inventory-management adds bulk stock, edits metadata and remains accessible at 320px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await login(page);
  const inventoryId = required('PHASE183_BULK_INVENTORY_ID');
  const before = await total(page, inventoryId);
  await page.goto(`http://localhost:3001/inventory/${inventoryId}`);
  await expect(
    page.getByRole('heading', { name: required('PHASE183_BULK_PRODUCT_NAME') }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add stock' }).click();
  await page.getByLabel('Quantity').fill('10');
  await page
    .getByLabel('Internal reason')
    .fill('Purchased ten guarded test units');
  await page.getByLabel('Reference (optional)').fill('P18.3-E2E-INVOICE');
  await page.getByRole('button', { name: 'Add 10 units' }).click();
  await expect(
    page.getByText('10 units added to rentable stock.'),
  ).toBeVisible();
  const after = await total(page, inventoryId);
  expect(after.totalQuantity).toBe(before.totalQuantity + 10);
  expect(after.states.RENTABLE).toBe(before.states.RENTABLE + 10);
  await expect(
    page.getByText('Purchased ten guarded test units'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit inventory' }).click();
  await expect(page.getByLabel(/total|quantity/i)).toHaveCount(0);
  await page
    .getByLabel('Internal operational notes')
    .fill('Phase 18.3 guarded operational note');
  await page.getByRole('button', { name: 'Save inventory' }).click();
  await expect(page.getByText('Inventory notes updated.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit inventory' }).click();
  await expect(page.getByLabel('Internal operational notes')).toHaveValue(
    'Phase 18.3 guarded operational note',
  );

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectAccessibleAndContained(page);
});

test('@inventory-management uses safe lifecycle dialogs and exact serialized assets at 1440px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);

  const unusedId = required('PHASE183_UNUSED_INVENTORY_ID');
  await page.goto(`http://localhost:3001/inventory/${unusedId}`);
  const deleteTrigger = page.getByRole('button', { name: 'Delete inventory' });
  await deleteTrigger.focus();
  await deleteTrigger.click();
  const deleteDialog = page.getByRole('dialog');
  await expect(
    deleteDialog.getByRole('heading', { name: 'Delete inventory?' }),
  ).toBeVisible();
  await expect(
    deleteDialog.getByRole('button', { name: 'Cancel' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deleteTrigger).toBeFocused();
  expect(
    (
      await page.request.get(`http://localhost:3001/api/inventory/${unusedId}`)
    ).status(),
  ).toBe(200);
  await deleteTrigger.click();
  await deleteDialog
    .getByLabel('Internal reason')
    .fill('Unused guarded inventory was created by mistake');
  await deleteDialog
    .getByRole('button', { name: 'Yes, delete inventory' })
    .click();
  await expect(page).toHaveURL('http://localhost:3001/inventory');
  expect(
    (
      await page.request.get(`http://localhost:3001/api/inventory/${unusedId}`)
    ).status(),
  ).toBe(404);

  const historicalId = required('PHASE183_HISTORICAL_INVENTORY_ID');
  await page.goto(`http://localhost:3001/inventory/${historicalId}`);
  await expect(
    page.getByRole('button', { name: 'Delete inventory' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive inventory' }).click();
  const archiveDialog = page.getByRole('dialog');
  await expect(
    archiveDialog.getByRole('heading', { name: 'Archive inventory?' }),
  ).toBeVisible();
  await archiveDialog
    .getByLabel('Internal reason')
    .fill('Archive the guarded historical fixture');
  await archiveDialog
    .getByRole('button', { name: 'Archive inventory' })
    .click();
  await expect(
    page.getByText('Archived', { exact: true }).first(),
  ).toBeVisible();
  await page.goto('http://localhost:3001/inventory');
  await expect(
    page.getByText(required('PHASE183_HISTORICAL_PRODUCT_NAME')),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived' }).click();
  await expect(
    page.getByText(required('PHASE183_HISTORICAL_PRODUCT_NAME')),
  ).toBeVisible();
  await page.goto(`http://localhost:3001/inventory/${historicalId}`);
  await page.getByRole('button', { name: 'Restore inventory' }).click();
  const restoreDialog = page.getByRole('dialog');
  await restoreDialog
    .getByLabel('Internal reason')
    .fill('Restore guarded inventory after lifecycle verification');
  await restoreDialog
    .getByRole('button', { name: 'Restore inventory' })
    .click();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

  const bulkId = required('PHASE183_BULK_INVENTORY_ID');
  await page.goto(`http://localhost:3001/inventory/${bulkId}`);
  await expect(
    page.getByText('Inventory cannot be archived yet'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Archive inventory' }),
  ).toBeDisabled();

  const serializedId = required('PHASE183_SERIALIZED_INVENTORY_ID');
  const asset = required('PHASE183_SERIALIZED_ASSET_NUMBER');
  await page.goto(`http://localhost:3001/inventory/${serializedId}`);
  await page.getByRole('button', { name: 'Add serialized asset' }).click();
  await page.getByLabel('Asset number').fill(asset);
  await page.getByLabel('Serial number (optional)').fill(`${asset}-SERIAL`);
  await page
    .getByLabel('Internal reason')
    .fill('Purchased guarded serialized camera');
  await page
    .getByRole('button', { name: 'Add serialized asset' })
    .last()
    .click();
  await expect(
    page.getByText(`Serialized asset ${asset} added.`),
  ).toBeVisible();
  await expect(page.getByText(asset, { exact: true })).toBeVisible();
  const publicResponse = await page.request.get(
    `http://localhost:4000/public/products?search=${encodeURIComponent(required('PHASE183_SERIALIZED_PRODUCT_NAME'))}`,
  );
  expect(publicResponse.ok()).toBe(true);
  expect(await publicResponse.text()).not.toMatch(
    new RegExp(
      `${asset}|serialNumber|assetNumber|totalQuantity|rentableQuantity`,
      'i',
    ),
  );
  await expectAccessibleAndContained(page);
});
