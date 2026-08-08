import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 240_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from the Phase 18 harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
}

async function loginAsReportViewer(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('PHASE18_REPORT_VIEWER_EMAIL'));
  await page
    .getByLabel(/password/i)
    .fill(required('PHASE18_REPORT_VIEWER_PASSWORD'));
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

test('@reports renders permission-aware reports, persists theme and exports CSV', async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto('http://localhost:3001/reports');
  await expect(
    page.getByRole('heading', { name: 'Operational reports' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Report sections' })
      .getByRole('link', { name: 'Inventory' }),
  ).toBeVisible();

  await page.goto('http://localhost:3001/reports/rental-requests');
  await expect(
    page.getByRole('heading', { name: 'Rental request report' }),
  ).toBeVisible();
  await expect(page.getByText(/America\/Toronto/i)).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^mensah-rentals-rental-requests-/,
  );

  if (testInfo.project.name === 'mobile-320') {
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  }
  await expectAccessibleAndContained(page);
});

test('@reports enforces view-only navigation, export, and domain boundaries', async ({
  page,
}) => {
  await loginAsReportViewer(page);
  await page.goto('http://localhost:3001/reports/rental-requests');
  await expect(
    page.getByRole('heading', { name: 'Rental request report' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export filtered CSV' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Report sections' })
      .getByRole('link', { name: 'Inventory' }),
  ).toHaveCount(0);

  expect(
    (
      await page.request.get('http://localhost:3001/api/reports/inventory')
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get('http://localhost:3001/api/system/status')
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get('http://localhost:3000/admin/reports')).status(),
  ).toBe(404);
  await expectAccessibleAndContained(page);
});

test('@audit presents immutable safe history and bounded CSV export', async ({
  page,
}) => {
  await login(page);
  await page.goto('http://localhost:3001/reports/audit');
  await expect(
    page.getByRole('heading', { name: 'Audit history' }),
  ).toBeVisible();
  await expect(page.getByText(/cannot be edited or deleted/i)).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(
    /passwordHash|sessionTokenHash|DATABASE_URL|capabilityHash/,
  );

  const detailLink = page.locator('a[href^="/reports/audit/"]:visible').first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  await expect(
    page.getByRole('heading', { name: 'Audit detail' }),
  ).toBeVisible();
  const detailBody = await page.locator('body').innerText();
  expect(detailBody).not.toMatch(
    /passwordHash|sessionTokenHash|DATABASE_URL|capabilityHash|metadata/i,
  );
  await page.getByRole('link', { name: 'Back to audit history' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mensah-rentals-audit-/);
  await expectAccessibleAndContained(page);
});

test('@system-status exposes safe readiness without secrets or operator controls', async ({
  page,
}) => {
  await login(page);
  await page.goto('http://localhost:3001/system/status');
  await expect(
    page.getByRole('heading', { name: 'System status' }),
  ).toBeVisible();
  await expect(page.getByText('Database', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Backup verification', { exact: true }),
  ).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(
    /postgresql:\/\/|GOOGLE_PLACES_API_KEY|SESSION_SECRET|storage\/test-media/i,
  );
  await expectAccessibleAndContained(page);
});
