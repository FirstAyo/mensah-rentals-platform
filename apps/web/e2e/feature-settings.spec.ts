import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the Phase 18.5 harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

async function applyPreset(page: Page, name: string, reason?: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByLabel('Internal reason').fill(reason);
  await dialog.getByRole('button', { name: 'Apply preset' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByLabel('Notifications')
      .getByRole('status')
      .filter({ hasText: 'Feature preset applied successfully' })
      .last(),
  ).toBeVisible();
}

test('@feature-settings Website Only preserves the public catalogue and hides operations', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  await page.goto('http://localhost:3001/settings/features');
  await expect(
    page.getByRole('heading', { name: 'Feature controls', exact: true }),
  ).toBeVisible();
  await applyPreset(
    page,
    'Website Only',
    'Initial public website launch without operational workflows.',
  );
  await expect(page.getByRole('link', { name: 'Inventory' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Rental Requests' })).toHaveCount(
    0,
  );
  await page.goto('http://localhost:3001/inventory');
  await expect(
    page.getByRole('heading', { name: /Inventory tracking is disabled/i }),
  ).toBeVisible();

  await page.goto('http://localhost:3000/rentals');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /track request/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: /rental cart/i })).toHaveCount(0);
  const disabledCart = await page.request.get(
    'http://localhost:4000/public/cart',
  );
  expect(disabledCart.status()).toBe(409);
  await page.goto('http://localhost:3000/cart');
  await expect(
    page.getByRole('heading', {
      name: /Rental cart is currently unavailable/i,
    }),
  ).toBeVisible();
  await page.goto('http://localhost:3000/rentals');
  const productLink = page.getByRole('link', { name: /^View / }).first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  await expect(
    page.getByText('Rental requests are currently offline'),
  ).toBeVisible();
});

test('@feature-settings dependency, blocker, Testing, toast, and restoration workflows', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  await page.goto('http://localhost:3001/settings/features');

  const reservations = page
    .getByRole('heading', { name: 'Reservations', exact: true })
    .locator('xpath=ancestor::article');
  await reservations.getByLabel('Rollout state').selectOption('ENABLED');
  const dependencyDialog = page.getByRole('dialog');
  await expect(dependencyDialog.getByText(/Inventory tracking/i)).toBeVisible();
  await expect(dependencyDialog.getByText(/Quotes and orders/i)).toBeVisible();
  await dependencyDialog
    .getByRole('button', { name: /Update 4 features/ })
    .click();
  await expect(dependencyDialog).toBeHidden();
  await expect(page.getByRole('link', { name: 'Inventory' })).toBeVisible();

  await applyPreset(page, 'Full Operations');
  const inventoryResponse = await page.request.post(
    'http://localhost:3001/api/inventory',
    {
      data: {
        initialQuantity: 2,
        initialState: 'RENTABLE',
        operationId: crypto.randomUUID(),
        productId: required('PHASE185_PRODUCT_ID'),
        reason: 'Phase 18.5 live blocker browser fixture.',
        trackingMode: 'BULK',
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(inventoryResponse.ok(), await inventoryResponse.text()).toBe(true);
  const inventory = (await inventoryResponse.json()) as { id: string };
  const workResponse = await page.request.post(
    'http://localhost:3001/api/maintenance/work-orders',
    {
      data: {
        assignedStaffUserId: null,
        description:
          'Open work proves maintenance cannot be disabled unsafely.',
        dueAt: null,
        inventoryId: inventory.id,
        inventoryItemId: null,
        operationId: crypto.randomUUID(),
        priority: 'NORMAL',
        quantity: 1,
        scheduledFor: null,
        source: 'MANUAL',
        sourceInspectionId: null,
        sourceRentalIssueId: null,
        sourceRentalReturnItemId: null,
        sourceState: 'RENTABLE',
        title: 'Phase 18.5 blocker fixture',
        type: 'PREVENTIVE',
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(workResponse.ok(), await workResponse.text()).toBe(true);
  const settingsResponse = await page.request.get(
    'http://localhost:3001/api/feature-settings',
  );
  const settings = (await settingsResponse.json()) as {
    features: Array<{ key: string; version: number }>;
  };
  const maintenance = settings.features.find(
    (item) => item.key === 'MAINTENANCE',
  )!;
  const status = await page.evaluate(
    async ({ version }) => {
      const response = await fetch('/api/feature-settings', {
        body: JSON.stringify({
          expectedVersions: { MAINTENANCE: version },
          featureKey: 'MAINTENANCE',
          includeDependencies: false,
          includeDependents: true,
          operationId: crypto.randomUUID(),
          reason: 'Attempt unsafe disable with live maintenance work.',
          state: 'DISABLED',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      return response.status;
    },
    { version: maintenance.version },
  );
  expect(status).toBe(422);
  await expect(
    page.getByLabel('Notifications').getByRole('alert').last(),
  ).toContainText(/cannot be changed safely/i);

  await applyPreset(page, 'Staged Operations Test');
  await expect(
    page.getByText('Testing', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.filter(({ impact }) =>
      ['critical', 'serious'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  await applyPreset(page, 'Full Operations');
});

test('@feature-settings remains contained and accessible at responsive widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await login(page);
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
    await page.goto('http://localhost:3001/settings/features');
    await expect(
      page.getByRole('heading', { name: 'Feature controls', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.filter(({ impact }) =>
        ['critical', 'serious'].includes(impact ?? ''),
      ),
    ).toEqual([]);
  }
});
