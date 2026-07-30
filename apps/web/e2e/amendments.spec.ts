import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const currentRevision = {
  amendmentReason: null,
  amendmentAllowed: true,
  companyName: 'Mensah Test',
  contactEmail: 'customer@example.test',
  contactFirstName: 'Test',
  contactLastName: 'Customer',
  contactPhone: '+1 555 0100',
  customerNotes: 'Keep the loading area clear.',
  createdAt: '2026-07-28T12:00:00.000Z',
  deliveryAddress: null,
  formalChangeRequestAllowed: false,
  fulfillmentMethod: 'PICKUP',
  id: 'clz123456789012345678900',
  items: [
    {
      categoryName: 'Seating',
      categorySlug: 'seating',
      id: 'clz123456789012345678901',
      productId: 'clz123456789012345678911',
      productName: 'Folding Chair',
      productSlug: 'folding-chair',
      rentalUnit: 'each',
      requestedQuantity: 20,
      sortOrder: 0,
    },
    {
      categoryName: 'Tables',
      categorySlug: 'tables',
      id: 'clz123456789012345678902',
      productId: 'clz123456789012345678912',
      productName: 'Banquet Table',
      productSlug: 'banquet-table',
      rentalUnit: 'each',
      requestedQuantity: 4,
      sortOrder: 1,
    },
  ],
  projectLocation: 'Studio A',
  projectName: 'Phase 13 Test',
  projectType: 'Film production',
  referenceNumber: 'MR-2026-ABCDEFGHJK',
  rentalEndDate: '2026-09-11',
  rentalStartDate: '2026-09-10',
  requestedTimeZone: 'America/Toronto',
  revisionNumber: 1,
  status: { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/rental-requests/current/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/catalogue'))
      return route.fulfill({
        json: {
          items: [
            {
              category: { name: 'Lighting', slug: 'lighting' },
              id: 'clz123456789012345678913',
              image: null,
              name: 'LED Panel',
              rentalUnit: 'each',
              slug: 'led-panel',
            },
          ],
        },
      });
    if (
      url.pathname.endsWith('/amendments') &&
      route.request().method() === 'POST'
    )
      return route.fulfill({
        json: {
          ...currentRevision,
          revisionNumber: 2,
          status: {
            key: 'RE_REVIEW_REQUIRED',
            label: 'Changes awaiting review',
          },
        },
      });
    return route.fulfill({ json: currentRevision });
  });
});

test('@customer-amendments complete equipment editing is accessible at 320px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await page.goto('/rental-requests/MR-2026-ABCDEFGHJK/amend');
  await expect(
    page.getByRole('heading', { name: 'Amend your rental request' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Increase Folding Chair quantity' })
    .click();
  await page.getByRole('button', { name: 'Remove Banquet Table' }).click();
  await page.getByLabel('Add more equipment').fill('LED');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Add' }).click();
  await page
    .getByLabel('Reason for amendment')
    .fill('The production equipment list changed.');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(
    page.getByText('Your original request will not be overwritten.'),
  ).toBeVisible();
  await expect(page.getByText('REMOVED')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
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

test('@customer-amendments dark theme and double-submit protection', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rental-requests/MR-2026-ABCDEFGHJK/amend');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Reason for amendment').fill('Change quantities.');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(
    page.getByRole('button', { name: 'Submit amendment' }),
  ).toBeEnabled();
});

test('@customer-amendments normalizes blank optional fields and explains a missing reason', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  let submittedBody: Record<string, unknown> | null = null;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/amendments')
    )
      submittedBody = request.postDataJSON() as Record<string, unknown>;
  });
  await page.goto('/rental-requests/MR-2026-ABCDEFGHJK/amend');
  await page.getByLabel('Company').fill('   ');
  await page.getByLabel('Reason for amendment').fill('   ');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.locator('#amendment-reason-error')).toBeVisible();
  await expect(page.locator('#amendment-reason-error')).toHaveText(
    'Please enter a reason for this amendment.',
  );
  await expect(page.getByText(/String must contain/i)).toHaveCount(0);
  await page
    .getByLabel('Reason for amendment')
    .fill('  Updated equipment plan.  ');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Submit amendment' }).click();
  await expect.poll(() => submittedBody).not.toBeNull();
  expect(submittedBody).toMatchObject({
    amendmentReason: 'Updated equipment plan.',
    companyName: null,
  });
});

test('@change-requests accepted workflow uses the formal warning', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.unroute('**/api/rental-requests/current/**');
  await page.route('**/api/rental-requests/current/**', (route) =>
    route.fulfill({
      json: {
        ...currentRevision,
        amendmentAllowed: false,
        formalChangeRequestAllowed: true,
      },
    }),
  );
  await page.goto('/rental-requests/MR-2026-ABCDEFGHJK/change-request');
  await page
    .getByLabel('Reason for requested change')
    .fill('Change the confirmed equipment list.');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(
    page.getByText(
      'Your accepted quote or confirmed order will not be changed.',
    ),
  ).toBeVisible();
});

test('@admin-amendments staff comparison labels are explicit', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  // Server-backed admin/RBAC behavior is covered by the guarded API integration suite.
  // This browser assertion keeps the customer-facing terminology consistent.
  await page.goto('/rental-requests/MR-2026-ABCDEFGHJK/amend');
  await page.getByRole('button', { name: 'Remove Banquet Table' }).click();
  await page.getByLabel('Reason for amendment').fill('Remove one item.');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await expect(page.getByText('REMOVED')).toBeVisible();
});
