import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 240_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from the browser harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

async function expectContained(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test('@runtime-regression keeps Admin query pages inside the root provider', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await login(page);

  await page.goto('http://localhost:3001/change-requests');
  await expect(
    page.getByRole('heading', {
      name: 'Formal change requests',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/No formal change requests|Customer changes/).first(),
  ).toBeVisible();
  await expectContained(page);

  await page.route('**/api/change-requests?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({
      body: JSON.stringify({ message: 'test-owned outage' }),
      contentType: 'application/json',
      status: 503,
    });
  });
  await page.reload();
  await expect(page.getByText(/Loading change requests/)).toBeVisible();
  await expect(
    page.getByText('Formal change requests could not be loaded.'),
  ).toBeVisible();
  await page.unroute('**/api/change-requests?*');
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Formal change requests',
      exact: true,
    }),
  ).toBeVisible();

  const listResponse = await page.request.get(
    'http://localhost:3001/api/change-requests?page=1&pageSize=50',
  );
  if (listResponse.ok()) {
    const items = (await listResponse.json()) as Array<{ id?: string }>;
    const firstId = items.find((item) => item.id)?.id;
    if (firstId) {
      const response = await page.goto(
        `http://localhost:3001/change-requests/${firstId}`,
      );
      expect(response?.status()).toBeLessThan(500);
      expect(await page.locator('body').innerText()).not.toContain(
        'No QueryClient set',
      );
    }
  }

  for (const path of [
    '/',
    '/rental-requests',
    '/quotes',
    '/orders',
    '/maintenance/work-orders',
    '/reports',
  ]) {
    const response = await page.goto(`http://localhost:3001${path}`);
    expect(response?.status(), path).toBeLessThan(500);
    expect(await page.locator('body').innerText(), path).not.toContain(
      'No QueryClient set',
    );
    await expectContained(page);
  }

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.goto('http://localhost:3001/change-requests');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      ['critical', 'serious'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  expect(runtimeErrors.join('\n')).not.toMatch(
    /No QueryClient set|hydration failed|hydration mismatch/i,
  );
});
