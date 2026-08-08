import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

test.describe.configure({ timeout: 360_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from the Phase 17 harness.`);
  return value;
}

async function loginWith(page: Page, emailName: string, passwordName: string) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required(emailName));
  await page.getByLabel(/password/i).fill(required(passwordName));
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function login(page: Page) {
  await loginWith(page, 'STAFF_BOOTSTRAP_EMAIL', 'STAFF_BOOTSTRAP_PASSWORD');
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
}

async function seriousAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter(({ impact }) =>
      ['critical', 'serious'].includes(impact ?? ''),
    ),
  ).toEqual([]);
}

async function expectJson(
  response: APIResponse,
  status: number | number[] = [200, 201],
) {
  const text = await response.text();
  expect(Array.isArray(status) ? status : [status], text).toContain(
    response.status(),
  );
  return JSON.parse(text) as Record<string, unknown>;
}

async function command(
  page: Page,
  path: string,
  data: Record<string, unknown>,
) {
  const response = await page.request.post(
    `http://localhost:3001/api/maintenance/${path}`,
    {
      data,
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  return expectJson(response);
}

test('@maintenance creates responsive work and persists dark mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await login(page);
  await page.goto('http://localhost:3001/maintenance/work-orders/new');
  await page
    .getByRole('combobox', { name: 'Equipment', exact: true })
    .selectOption(required('PHASE17_PREVENTIVE_INVENTORY_ID'));
  await page.getByLabel('Maintenance quantity').fill('2');
  await page.getByLabel('Title').fill('Phase 17 mobile preventive service');
  await page
    .getByLabel('Description')
    .fill('Inspect and service this test-owned equipment.');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect(page).toHaveURL(/maintenance\/work-orders\/[a-z0-9]+/, {
    timeout: 30_000,
  });
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await seriousAxe(page);

  const quantities = await expectJson(
    await page.request.get(
      `http://localhost:3001/api/inventory/${required('PHASE17_PREVENTIVE_INVENTORY_ID')}/quantities`,
    ),
  );
  expect(quantities.totalQuantity).toBe(4);
  expect((quantities.states as Record<string, number>).RENTABLE).toBe(2);
  expect((quantities.states as Record<string, number>).MAINTENANCE).toBe(2);
});

test('@maintenance serializes an exact asset and rejects concurrent duplicate work', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  const base = {
    source: 'MANUAL',
    sourceState: 'RENTABLE',
    type: 'PREVENTIVE',
    priority: 'HIGH',
    title: 'Serialized safety service',
    description: 'One exact serialized asset must be claimed once.',
    inventoryId: required('PHASE17_SERIALIZED_INVENTORY_ID'),
    inventoryItemId: required('PHASE17_SERIALIZED_ITEM_ID'),
    quantity: 1,
  };
  const [first, second] = await Promise.all([
    page.request.post('http://localhost:3001/api/maintenance/work-orders', {
      data: { ...base, operationId: crypto.randomUUID() },
      headers: { Origin: 'http://localhost:3001' },
    }),
    page.request.post('http://localhost:3001/api/maintenance/work-orders', {
      data: { ...base, operationId: crypto.randomUUID() },
      headers: { Origin: 'http://localhost:3001' },
    }),
  ]);
  expect([first.status(), second.status()].sort()).toEqual([201, 409]);
  const created = (await (first.status() === 201 ? first : second).json()) as {
    id: string;
  };
  await page.goto(
    `http://localhost:3001/maintenance/work-orders/${created.id}`,
  );
  await expect(
    page.getByRole('heading', { name: 'Serialized safety service' }),
  ).toBeVisible();
  await seriousAxe(page);
});

test('@inspections requires a passed post-maintenance inspection before returning equipment to service', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await login(page);
  let work = await command(page, 'work-orders', {
    operationId: crypto.randomUUID(),
    source: 'MANUAL',
    sourceState: 'DAMAGED',
    type: 'CORRECTIVE',
    priority: 'NORMAL',
    title: 'Phase 17 damaged equipment repair',
    description: 'Repair the guarded damaged-equipment fixture.',
    inventoryId: required('PHASE17_DAMAGED_INVENTORY_ID'),
    quantity: 2,
  });
  work = await command(page, `work-orders/${work.id as string}/start`, {
    operationId: crypto.randomUUID(),
    expectedVersion: work.version,
  });
  work = await command(
    page,
    `work-orders/${work.id as string}/ready-for-inspection`,
    { operationId: crypto.randomUUID(), expectedVersion: work.version },
  );

  const blocked = await page.request.post(
    `http://localhost:3001/api/maintenance/work-orders/${work.id as string}/complete`,
    {
      data: {
        operationId: crypto.randomUUID(),
        expectedVersion: work.version,
        completionOutcome: 'RETURN_TO_SERVICE',
        completionSummary: 'This should be blocked until inspection passes.',
        resolveLinkedIssueAsRepaired: false,
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(blocked.status()).toBe(422);

  await page.goto(
    `http://localhost:3001/maintenance/inspections/new?sourceWorkOrderId=${work.id as string}`,
  );
  const scheduled = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel('Scheduled for').fill(scheduled);
  await page.getByRole('button', { name: 'Schedule inspection' }).click();
  await expect(page).toHaveURL(/maintenance\/inspections\/[a-z0-9]+/, {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Start inspection' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Start inspection' })
    .click();
  await expect(
    page.getByText('In Progress', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pass inspection' }).click();
  await page
    .getByLabel('Inspection summary')
    .fill('All post-maintenance checks passed.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Pass inspection' })
    .click();
  await expect(page.getByText('Passed', { exact: true }).first()).toBeVisible();

  await page.goto(
    `http://localhost:3001/maintenance/work-orders/${work.id as string}`,
  );
  await page
    .getByLabel('Completion summary')
    .fill('Repair completed and independently inspected.');
  await page.getByRole('button', { name: 'Complete work order' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Complete work order' })
    .click();
  await expect(
    page.getByText('Completed', { exact: true }).first(),
  ).toBeVisible();

  const quantities = await expectJson(
    await page.request.get(
      `http://localhost:3001/api/inventory/${required('PHASE17_DAMAGED_INVENTORY_ID')}/quantities`,
    ),
  );
  expect(quantities.totalQuantity).toBe(3);
  expect((quantities.states as Record<string, number>).RENTABLE).toBe(2);
  expect((quantities.states as Record<string, number>).DAMAGED).toBe(1);
  expect((quantities.states as Record<string, number>).MAINTENANCE).toBe(0);

  const publicResponse = await page.request.get(
    `http://localhost:4000/public/products?search=${encodeURIComponent(required('PHASE17_DAMAGED_PRODUCT_NAME'))}`,
  );
  expect(publicResponse.ok()).toBe(true);
  expect(await publicResponse.text()).not.toMatch(
    /workOrderNumber|inspectionNumber|inventoryItemId|serialNumber|assignedStaffUserId|maintenanceOperationId/i,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await seriousAxe(page);
});

test('@inspections failed inspection resumes repair and a new passed inspection permits completion', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  let work = await command(page, 'work-orders', {
    operationId: crypto.randomUUID(),
    source: 'MANUAL',
    sourceState: 'DAMAGED',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    title: 'Phase 17 reinspected corrective repair',
    description: 'Exercise the failed-inspection rework lifecycle.',
    inventoryId: required('PHASE17_DAMAGED_INVENTORY_ID'),
    quantity: 1,
  });
  work = await command(page, `work-orders/${work.id as string}/start`, {
    operationId: crypto.randomUUID(),
    expectedVersion: work.version,
  });
  work = await command(
    page,
    `work-orders/${work.id as string}/ready-for-inspection`,
    { operationId: crypto.randomUUID(), expectedVersion: work.version },
  );

  const schedule = async () =>
    command(page, 'inspections', {
      operationId: crypto.randomUUID(),
      type: 'POST_MAINTENANCE',
      inventoryId: required('PHASE17_DAMAGED_INVENTORY_ID'),
      inventoryItemId: null,
      quantity: 1,
      sourceWorkOrderId: work.id,
      assignedStaffUserId: null,
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    });
  let inspection = await schedule();
  inspection = await command(
    page,
    `inspections/${inspection.id as string}/start`,
    { operationId: crypto.randomUUID(), expectedVersion: inspection.version },
  );
  await command(page, `inspections/${inspection.id as string}/fail`, {
    operationId: crypto.randomUUID(),
    expectedVersion: inspection.version,
    summary: 'A guard remains loose; further corrective work is required.',
  });

  work = await expectJson(
    await page.request.get(
      `http://localhost:3001/api/maintenance/work-orders/${work.id as string}`,
    ),
  );
  expect(work.status).toBe('IN_PROGRESS');
  work = await command(
    page,
    `work-orders/${work.id as string}/ready-for-inspection`,
    { operationId: crypto.randomUUID(), expectedVersion: work.version },
  );
  inspection = await schedule();
  inspection = await command(
    page,
    `inspections/${inspection.id as string}/start`,
    { operationId: crypto.randomUUID(), expectedVersion: inspection.version },
  );
  await command(page, `inspections/${inspection.id as string}/pass`, {
    operationId: crypto.randomUUID(),
    expectedVersion: inspection.version,
    summary: 'Rework verified; all checks now pass.',
  });
  await command(page, `work-orders/${work.id as string}/complete`, {
    operationId: crypto.randomUUID(),
    expectedVersion: work.version,
    completionOutcome: 'RETURN_TO_SERVICE',
    completionSummary: 'Corrective rework and independent inspection complete.',
    resolveLinkedIssueAsRepaired: false,
  });

  await page.goto(
    `http://localhost:3001/maintenance/work-orders/${work.id as string}`,
  );
  await expect(
    page.getByText('Completed', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/post maintenance.*failed/i).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/post maintenance.*passed/i).first(),
  ).toBeVisible();
  await seriousAxe(page);
});

test('@maintenance enforces read-only, sales, disabled-user, dashboard and focus boundaries', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  const created = await command(page, 'work-orders', {
    operationId: crypto.randomUUID(),
    source: 'MANUAL',
    sourceState: 'RENTABLE',
    type: 'PREVENTIVE',
    priority: 'NORMAL',
    title: 'Phase 17 permission boundary fixture',
    description: 'Existing maintenance stock used for permission UI checks.',
    inventoryId: required('PHASE17_PERMISSION_INVENTORY_ID'),
    quantity: 1,
  });
  await page.goto('http://localhost:3001/');
  await expect(page.getByText('Open maintenance work orders')).toBeVisible();

  await page.context().clearCookies();
  await loginWith(page, 'PHASE17_VIEW_EMAIL', 'PHASE17_VIEW_PASSWORD');
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
  await page.goto('http://localhost:3001/maintenance/work-orders');
  await expect(
    page.getByRole('heading', { name: 'Maintenance work orders' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /new work order/i })).toHaveCount(
    0,
  );
  await page.goto(
    `http://localhost:3001/maintenance/work-orders/${created.id as string}`,
  );
  await expect(page.getByRole('button', { name: 'Start work' })).toHaveCount(0);
  const forbiddenMutation = await page.request.post(
    `http://localhost:3001/api/maintenance/work-orders/${created.id as string}/start`,
    {
      data: {
        operationId: crypto.randomUUID(),
        expectedVersion: created.version,
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(forbiddenMutation.status()).toBe(403);

  await page.context().clearCookies();
  await loginWith(page, 'PHASE17_SALES_EMAIL', 'PHASE17_SALES_PASSWORD');
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
  const salesResponse = await page.request.get(
    'http://localhost:3001/api/maintenance/work-orders',
  );
  expect(salesResponse.status()).toBe(403);
  await page.goto('http://localhost:3001/maintenance/work-orders');
  await expect(page).toHaveURL(/\/forbidden$/);

  await page.context().clearCookies();
  await loginWith(page, 'PHASE17_DISABLED_EMAIL', 'PHASE17_DISABLED_PASSWORD');
  await expect(page).toHaveURL('http://localhost:3001/login');
  await expect(page.getByText(/unable to sign in/i)).toBeVisible();

  await page.context().clearCookies();
  await login(page);
  await page.goto(
    `http://localhost:3001/maintenance/work-orders/${created.id as string}`,
  );
  const start = page.getByRole('button', { name: 'Start work' });
  await start.focus();
  await start.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Keep current state' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(start).toBeFocused();
  await seriousAxe(page);
});
