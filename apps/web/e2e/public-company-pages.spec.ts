import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the Phase 18.6 harness.`);
  return value;
}

async function expectAccessibleAndContained(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
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

function findForbiddenPublicKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      findForbiddenPublicKeys(item, `${path}[${index}]`),
    );
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, nested]) => {
    const currentPath = `${path}.${key}`;
    const current =
      /^(mediaRef|draftRevision|createdBy|publishedBy|operationId|payloadHash|inventory|reservation|password|session|permission)$/i.test(
        key,
      )
        ? [currentPath]
        : [];
    return [...current, ...findForbiddenPublicKeys(nested, currentPath)];
  });
}

async function login(page: Page) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(required('STAFF_BOOTSTRAP_EMAIL'));
  await page.getByLabel(/password/i).fill(required('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
}

test.beforeEach(() => {
  if (process.env.MENSAH_ISOLATED_E2E !== 'verified-local-test-database')
    throw new Error(
      'Company-page browser tests require the guarded isolated test database.',
    );
});

test('@public-company-pages publishes truthful company, legal, and SEO pages', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  for (const path of ['/about', '/contact', '/privacy', '/terms']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://mensahrentals.com${path}`,
    );
    await expectAccessibleAndContained(page);
    expect(
      (await page.locator('body').innerText()).toLowerCase(),
    ).not.toContain('11566 eburne');
    expect(
      (await page.locator('body').innerText()).toLowerCase(),
    ).not.toContain('11568 eburne');
  }
  await page.goto('/terms');
  await expect(page.getByText(/^1\. Charges:/)).toBeVisible();
  await expect(page.getByText(/^8\. Equipment Return:/)).toBeVisible();
  await expect(page.getByText(/not covered by insurance/i)).toBeVisible();
  await page.goto('/contact');
  await expect(
    page.getByRole('link', { name: '(604) 644-5265' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'info@mensahrentals.com' }),
  ).toBeVisible();
  const sitemap = await (
    await request.get('http://localhost:3000/sitemap.xml')
  ).text();
  expect(sitemap).toContain('https://mensahrentals.com/about');
  expect(sitemap).toContain('https://mensahrentals.com/contact');
  expect(sitemap).toContain('https://mensahrentals.com/privacy');
  expect(sitemap).toContain('https://mensahrentals.com/terms');
  expect(sitemap).not.toMatch(/localhost|\/admin|\/api/);
});

test('@public-company-pages submits exactly one stored enquiry and manages it privately', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await page.goto('/contact');
  await page.getByLabel('Name *').fill('Phase Eighteen Customer');
  await page.getByLabel('Email *').fill('phase18-customer@example.test');
  await page.getByLabel('Phone').fill('(604) 555-0110');
  await page
    .getByRole('textbox', { name: 'Company', exact: true })
    .fill('Phase Eighteen Productions');
  await page.getByLabel('Enquiry type *').selectOption('RENTAL_PROJECT');
  await page
    .getByLabel('Message *')
    .fill('We need equipment for a browser-test production in Richmond.');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  const status = page
    .getByRole('status')
    .filter({ hasText: 'Your enquiry has been received.' });
  await expect(status).toBeVisible();
  const text = await status.innerText();
  const reference = text.match(/ENQ-\d{8}-[A-F0-9]{8}/)?.[0];
  expect(reference).toBeTruthy();
  await expect(
    page.getByRole('button', { name: 'Send enquiry' }),
  ).toBeEnabled();

  const safe = await page.request.post(
    'http://localhost:3000/api/contact-enquiries',
    {
      data: {
        email: 'second-phase18@example.test',
        enquiryType: 'GENERAL',
        message: 'A second safe enquiry used to inspect the public response.',
        name: 'Second Customer',
        operationId: crypto.randomUUID(),
        website: '',
      },
      headers: { Origin: 'http://localhost:3000' },
    },
  );
  expect(safe.status()).toBe(202);
  expect(JSON.stringify(await safe.json())).not.toMatch(
    /inventory|staff|permission|operationId|payloadHash|session|capability|password|serial|asset/i,
  );

  await login(page);
  await page.goto('http://localhost:3001/contact-enquiries');
  await expect(
    page.getByRole('heading', { name: 'Contact enquiries' }),
  ).toBeVisible();
  await page.getByLabel('Search').fill(reference!);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: reference! }).click();
  await expect(page.getByText('Phase Eighteen Customer')).toBeVisible();
  await page.getByRole('button', { name: 'READ' }).click();
  await expect(page.getByText('Enquiry status updated.')).toBeVisible();
  await expect(page.getByText('READ', { exact: true }).first()).toBeVisible();
});

test('@public-company-pages remains responsive and theme-safe at all required widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.goto('/about');
    await expectAccessibleAndContained(page);
    await page.goto('/contact');
    await expectAccessibleAndContained(page);
    await page.goto('/terms');
    await expectAccessibleAndContained(page);
    await page.goto('/privacy');
    await expectAccessibleAndContained(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contact');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Open navigation menu').click();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeVisible();
  await expectAccessibleAndContained(page);
});

test('@public-company-pages safely ignores honeypot submissions', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const response = await request.post(
    'http://localhost:3000/api/contact-enquiries',
    {
      data: {
        email: 'honeypot@example.test',
        enquiryType: 'OTHER',
        message: 'This bot-looking submission must not create a staff record.',
        name: 'Automated Sender',
        operationId: crypto.randomUUID(),
        website: 'https://spam.example',
      },
      headers: { Origin: 'http://localhost:3000' },
    },
  );
  expect(response.status()).toBe(202);
  expect((await response.json()).referenceNumber).toBeNull();
});

test('@public-company-pages keeps drafts private and publishes/restores immutable revisions', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const publicBefore = await (
    await request.get('http://localhost:4000/public/pages/ABOUT')
  ).json();
  const originalTitle = publicBefore.content.hero.title as string;
  expect(findForbiddenPublicKeys(publicBefore)).toEqual([]);

  await login(page);
  await page.goto('http://localhost:3001/website/public-pages/about');
  await expect(page.getByRole('heading', { name: 'About page' })).toBeVisible();
  const hero = page.getByRole('group', { name: 'Hero' });
  const draftTitle = `Phase 18.6.1 draft ${Date.now()}`;
  await hero.getByLabel('Title', { exact: true }).fill(draftTitle);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Page draft saved.').first()).toBeVisible();

  const stillPublished = await (
    await request.get('http://localhost:4000/public/pages/ABOUT')
  ).json();
  expect(stillPublished.content.hero.title).toBe(originalTitle);

  await page.getByRole('link', { name: 'Preview' }).first().click();
  await expect(page.getByRole('heading', { name: draftTitle })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Page published.').first()).toBeVisible();
  await page.goto('http://localhost:3000/about');
  await expect(page.getByRole('heading', { name: draftTitle })).toBeVisible();

  await page.goto('http://localhost:3001/website/public-pages/about');
  const originalRevision = page
    .locator('div')
    .filter({ hasText: /^Revision 1 · published/ })
    .first();
  await originalRevision.getByRole('button', { name: 'Restore' }).click();
  await expect(
    page.getByText('Published revision restored.').first(),
  ).toBeVisible();
  await page.goto('http://localhost:3000/about');
  await expect(
    page.getByRole('heading', { name: originalTitle }),
  ).toBeVisible();
});
