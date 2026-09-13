import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const forbiddenPublicKeys =
  /inventory|available|reserved|maintenance|damaged|lost|rented|serial|asset|staff|permission|operationId|payloadHash|contentHash|storagePath/i;

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the Phase 19.2 harness.`);
  return value;
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

async function expectAccessible(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter(({ impact }) =>
      ['critical', 'serious'].includes(impact ?? ''),
    ),
  ).toEqual([]);
}

function expectSafeKeys(value: unknown, path = 'response') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectSafeKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(key, `${path}.${key}`).not.toMatch(forbiddenPublicKeys);
    expectSafeKeys(child, `${path}.${key}`);
  }
}

test.beforeEach(() => {
  if (process.env.MENSAH_ISOLATED_E2E !== 'verified-local-test-database')
    throw new Error(
      'Phase 19.2 browser tests require the isolated test database.',
    );
});

test('@gallery-homepage-launch-flow renders the premium company homepage, Gallery, and responsive navigation', async ({
  page,
  request,
}, testInfo) => {
  const title = required('PHASE192_GALLERY_TITLE');
  const slug = required('PHASE192_GALLERY_SLUG');
  await page.goto('/');
  for (const [service, href] of [
    ['Film Production', '/gallery?type=film-production'],
    ['Events & Festivals', '/gallery?type=events-festivals'],
    ['Corporate Functions', '/gallery?type=corporate-functions'],
    ['Private Functions', '/gallery?type=private-functions'],
  ] as const) {
    const serviceLink = page.getByRole('link', { name: new RegExp(service) });
    await expect(serviceLink.first()).toBeVisible();
    await expect(serviceLink.first()).toHaveAttribute('href', href);
  }
  await expect(page.getByText(title).first()).toBeVisible();
  if (testInfo.project.name === 'wide-1440') {
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    const rentals = navigation.getByRole('button', { name: 'Rentals' });
    await rentals.focus();
    await rentals.press('Enter');
    await expect(page.locator('#rentals-mega-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#rentals-mega-menu')).toBeHidden();
  } else {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
    await mobile.getByText('Rentals', { exact: true }).click();
    await expect(
      mobile.getByRole('link', { name: 'All equipment' }),
    ).toBeVisible();
  }

  await page.goto(`/gallery?type=events-festivals`);
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Popular rental gear' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /View all rentals/i }),
  ).toHaveAttribute('href', '/rentals');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/i,
  );
  await page.goto(`/gallery/${slug}`);
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Open image 1 of 1/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close image viewer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectAccessible(page);

  const listResponse = await request.get(
    'http://localhost:4000/public/gallery',
  );
  expect(listResponse.ok()).toBe(true);
  expectSafeKeys(await listResponse.json());
  const detailResponse = await request.get(
    `http://localhost:4000/public/gallery/${slug}`,
  );
  expect(detailResponse.ok()).toBe(true);
  expectSafeKeys(await detailResponse.json());
});

test('@gallery-homepage-launch-flow submits an Email Enquiry and exposes it only to authorized staff', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await page.goto('/rentals');
  await expect(
    page.getByRole('heading', { name: 'Can’t find what you need?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Contact our team' }),
  ).toHaveAttribute('href', '/contact');
  const product = page.locator('article a[href^="/rentals/"]').first();
  const href = await product.getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!);
  await page.getByLabel('Desired quantity').fill('100');
  await page.getByRole('button', { name: 'Add to rental cart' }).click();
  await page
    .getByRole('link', { name: /Rental cart, 1 equipment type/ })
    .click();
  await page.getByRole('link', { name: 'Send rental enquiry' }).click();
  await expect(page).toHaveURL(/\/cart\/enquiry$/);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const later = new Date(Date.now() + 3 * 86_400_000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  await page.getByLabel('Name *').fill('Phase Nineteen Customer');
  await page.getByLabel('Email *').fill('phase19-customer@example.test');
  await page.getByLabel('Phone *').fill('+1 604 555 0192');
  await page.getByLabel('Event or project name').fill('Premium launch test');
  await page.getByLabel('Start date *').fill(date(tomorrow));
  await page.getByLabel('End date *').fill(date(later));
  await page
    .getByLabel('Additional or unlisted equipment')
    .fill('A quiet generator');
  const submissionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/cart-enquiries') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send rental enquiry' }).click();
  const submissionResponse = await submissionResponsePromise;
  const submissionBody = await submissionResponse.text();
  expect(submissionResponse.status(), submissionBody).toBe(202);
  await expect(
    page.getByRole('heading', { name: 'Rental enquiry received' }),
  ).toBeVisible();
  const receiptText = await page.locator('main').innerText();
  expect(receiptText).toMatch(/MR-\d{8}-[A-F0-9]{8}/);
  expect(receiptText).not.toMatch(forbiddenPublicKeys);
  await expectAccessible(page);

  await login(page);
  await page.goto('http://localhost:3001/enquiries');
  await expect(page.getByText('Phase Nineteen Customer').first()).toBeVisible();
  await page.locator('a[href^="/enquiries/"]').first().click();
  await expect(page.getByText('A quiet generator')).toBeVisible();
  await expect(page.getByText('100', { exact: true })).toBeVisible();
  await expectAccessible(page);
});

test('@gallery-homepage-launch-flow lets staff inspect Gallery and safely switch customer submission modes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  await page.goto('http://localhost:3001/website/gallery');
  await expect(
    page.getByText(required('PHASE192_GALLERY_TITLE')).first(),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto('http://localhost:3001/settings/features');
  const mode = page.getByLabel('Submission mode');
  await expect(mode).toHaveValue('EMAIL_INQUIRY');
  await mode.selectOption('PLATFORM_REQUEST');
  await page.getByRole('button', { name: 'Save mode' }).click();
  await expect(mode).toHaveValue('PLATFORM_REQUEST');
  await mode.selectOption('EMAIL_INQUIRY');
  await page.getByRole('button', { name: 'Save mode' }).click();
  await expect(mode).toHaveValue('EMAIL_INQUIRY');
});
