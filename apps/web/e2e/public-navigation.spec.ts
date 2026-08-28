import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Response } from '@playwright/test';

const privateKeys =
  /(?:available|reserved|shortfall|maintenance|rented|lost|damaged|inventory|serial|asset|staff|audit|subrent)/i;

function collectUnexpectedFailures(page: Page) {
  const failures: string[] = [];
  const listener = (response: Response) => {
    if (
      response.status() >= 400 &&
      ['document', 'fetch', 'xhr'].includes(response.request().resourceType())
    )
      failures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
  };
  page.on('response', listener);
  return {
    failures,
    stop: () => page.off('response', listener),
  };
}

function expectCustomerSafe(value: unknown, path = 'response') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectCustomerSafe(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(key, `${path}.${key}`).not.toMatch(privateKeys);
    expectCustomerSafe(child, `${path}.${key}`);
  }
}

async function expectNoOverflowOrSeriousAxe(page: Page) {
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
}

test.beforeEach(() => {
  if (process.env.MENSAH_ISOLATED_E2E !== 'verified-local-test-database')
    throw new Error(
      'Public navigation browser tests require the guarded isolated test database.',
    );
});

test('@public-navigation follows desktop links, catalogue, cart, request, and footer routes', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const network = collectUnexpectedFailures(page);

  await page.goto('/');
  await expect(page).toHaveURL('http://localhost:3000/');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'How it works' })
    .click();
  await expect(page).toHaveURL(/\/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeVisible();

  await page.getByRole('link', { name: 'Mensah Rentals' }).first().click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Rentals', exact: true })
    .click();
  await expect(page).toHaveURL(/\/rentals$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Equipment for events',
  );

  await page.getByRole('link', { name: 'Mensah Rentals' }).first().click();
  await page.getByRole('link', { name: 'Browse rental equipment' }).click();
  await expect(page).toHaveURL(/\/rentals$/);
  await page.getByRole('link', { name: 'Mensah Rentals' }).first().click();
  const categoryLink = page
    .locator('main a[href^="/rentals/"]')
    .filter({ has: page.getByText(/^Category \d+$/) })
    .first();
  await categoryLink.click();
  await expect(page).toHaveURL(/\/rentals\/[^/?#]+$/);
  const productLink = page.locator('article a[href^="/rentals/"]').first();
  const productHref = await productLink.getAttribute('href');
  expect(productHref).toBeTruthy();
  await productLink.click();
  await expect(page).toHaveURL(/\/rentals\/[^/?#]+\/[^/?#]+$/);

  await page.getByLabel('Desired quantity').fill('100');
  await page.getByRole('button', { name: 'Add to rental cart' }).click();
  await page
    .getByRole('link', { name: 'Rental cart, 1 equipment type' })
    .click();
  await expect(page).toHaveURL(/\/cart$/);
  const quantity = page.getByLabel(/Desired quantity for/);
  await quantity.fill('101');
  await page.getByRole('button', { name: 'Save quantity' }).click();
  await expect(page.getByText(/quantity updated/i)).toBeVisible();
  await page.getByRole('link', { name: 'Continue to rental request' }).click();
  await expect(page).toHaveURL(/\/rental-request$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tell us about your project',
  );

  await page
    .getByRole('navigation', { name: 'Company links' })
    .getByRole('link', { name: 'Track request' })
    .click();
  await expect(page).toHaveURL(/\/track-request$/);
  await expect(page.getByLabel('Request reference')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Legal links' })
    .getByRole('link', { name: 'Privacy' })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page
    .getByRole('navigation', { name: 'Legal links' })
    .getByRole('link', { name: 'Terms' })
    .click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/terms$/);

  await page
    .getByRole('navigation', { name: 'Company links' })
    .getByRole('link', { name: 'Rentals' })
    .click();
  await expect(page).toHaveURL(/\/rentals$/);

  await page.goto('/cart');
  await page.getByRole('button', { name: /Remove .* from cart/ }).click();
  await expect(page.getByText('Your rental cart is empty')).toBeVisible();
  await page.goto(productHref!);
  await page.getByLabel('Desired quantity').fill('2');
  await page.getByRole('button', { name: 'Add to rental cart' }).click();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Clear cart' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear cart' })
    .click();
  await expect(page.getByText('Your rental cart is empty')).toBeVisible();

  const cartResponse = await request.get('http://localhost:3000/api/cart');
  expect(cartResponse.status()).toBe(200);
  expectCustomerSafe(await cartResponse.json());
  expect((await request.get('http://localhost:3001/login')).status()).toBe(200);
  expect((await request.get('http://localhost:4000/health')).status()).toBe(
    200,
  );

  network.stop();
  expect(network.failures).toEqual([]);
});

test('@public-navigation remains usable at 320px in dark mode and preserves genuine 404 handling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  const network = collectUnexpectedFailures(page);

  await page.goto('/');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Open navigation menu').click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Rentals' })
    .click();
  await expect(page).toHaveURL(/\/rentals$/);
  await expectNoOverflowOrSeriousAxe(page);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page
    .getByRole('navigation', { name: 'Company links' })
    .getByRole('link', { name: 'Track request' })
    .click();
  await expect(page).toHaveURL(/\/track-request$/);
  await expectNoOverflowOrSeriousAxe(page);

  network.stop();
  expect(network.failures).toEqual([]);

  const response = await page.goto('/this-page-does-not-exist-123');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('We could not find that page.')).toBeVisible();
});
