import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const productionOrigin = 'https://mensahrentals.com';
const forbiddenPublicData =
  /(?:availableQuantity|reservedQuantity|shortfallQuantity|inventoryId|serialNumber|staffUser|passwordHash|capability|sessionToken|priceCurrency|"offers"|"availability"|AggregateRating)/i;

function fixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing guarded SEO fixture ${name}.`);
  return value;
}

async function expectIndexableHead(
  page: Page,
  path: string,
  canonicalPath: string,
) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('title')).not.toBeEmpty();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /\S/,
  );
  const expectedUrl = `${productionOrigin}${canonicalPath}`;
  const rootCompatibleUrl =
    canonicalPath === '/' ? new RegExp(`^${productionOrigin}/?$`) : expectedUrl;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    rootCompatibleUrl,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    rootCompatibleUrl,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /index, follow/i,
  );
  const head = await page.locator('head').innerHTML();
  expect(head).not.toMatch(/localhost|127\.0\.0\.1/);
  expect(head).not.toMatch(forbiddenPublicData);
}

async function expectNoSeriousAxeOrOverflow(page: Page) {
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
    throw new Error('SEO browser tests require the guarded test database.');
});

test('@seo renders canonical public metadata and safe structured data', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const category = fixture('SEO_CATEGORY_SLUG');
  const withImage = fixture('SEO_PRODUCT_IMAGE_SLUG');
  const withoutImage = fixture('SEO_PRODUCT_NO_IMAGE_SLUG');
  const longName = fixture('SEO_LONG_NAME_PRODUCT_SLUG');

  await expectIndexableHead(page, '/', '/');
  const homepageJsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const homepageTypes = homepageJsonLd.map(
    (value) => (JSON.parse(value) as { '@type': string })['@type'],
  );
  expect(homepageTypes).toEqual(
    expect.arrayContaining(['Organization', 'WebSite']),
  );
  expect(homepageJsonLd.join(' ')).not.toMatch(forbiddenPublicData);

  await expectIndexableHead(page, '/rentals', '/rentals');
  await expectIndexableHead(
    page,
    `/rentals/${category}`,
    `/rentals/${category}`,
  );
  await expectIndexableHead(
    page,
    `/rentals/${category}/${withImage}`,
    `/rentals/${category}/${withImage}`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    new RegExp(`^${productionOrigin}/media/products/`),
  );
  const productJsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  for (const value of productJsonLd)
    expect(() => JSON.parse(value)).not.toThrow();
  expect(productJsonLd.join(' ')).not.toMatch(forbiddenPublicData);
  expect(productJsonLd.join(' ')).toContain('BreadcrumbList');
  expect(productJsonLd.join(' ')).toContain('Product');

  await expectIndexableHead(
    page,
    `/rentals/${category}/${withoutImage}`,
    `/rentals/${category}/${withoutImage}`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await expectIndexableHead(
    page,
    `/rentals/${category}/${longName}`,
    `/rentals/${category}/${longName}`,
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Extra Long Professional Event Production Equipment Package',
  );
  await expectIndexableHead(page, '/privacy', '/privacy');
  await expectIndexableHead(page, '/terms', '/terms');
});

test('@seo keeps query variants, private routes, and missing content out of the index', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const category = fixture('SEO_CATEGORY_SLUG');
  await page.goto('/rentals?search=equipment&sort=name-asc&page=1');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${productionOrigin}/rentals`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex, follow/i,
  );

  for (const path of [
    '/rentals?view=grid',
    '/rentals?filter=unknown',
    '/rentals?page=abc',
    '/rentals?sort=bogus',
    `/rentals/${category}?view=grid`,
  ]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex, follow/i,
    );
  }

  for (const path of [
    '/cart',
    '/rental-request',
    '/track-request',
    '/quote',
    '/order',
    '/rental-requests/MR-2026-SEO-PRIVATE',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(response.headers()['x-robots-tag']).toContain('nofollow');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
  }

  const missing = await page.goto('/seo-page-that-does-not-exist');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('meta[name=robots]').first()).toHaveAttribute(
    'content',
    /noindex/i,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  for (const path of [
    `/rentals/${category}/${fixture('SEO_INACTIVE_PRODUCT_SLUG')}`,
    `/rentals/${category}/${fixture('SEO_TOMBSTONED_PRODUCT_SLUG')}`,
    `/rentals/${fixture('SEO_INACTIVE_CATEGORY_SLUG')}`,
  ]) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
});

test('@seo exposes a production-only sitemap and safe robots policy', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain(`${productionOrigin}/`);
  expect(sitemap).toContain(`${productionOrigin}/rentals`);
  expect(sitemap).toContain(fixture('SEO_PRODUCT_IMAGE_SLUG'));
  expect(sitemap).not.toContain(fixture('SEO_INACTIVE_PRODUCT_SLUG'));
  expect(sitemap).not.toContain(fixture('SEO_TOMBSTONED_PRODUCT_SLUG'));
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (match) => match[1],
  );
  expect(locations.join('\n')).not.toMatch(
    /localhost|127\.0\.0\.1|\/admin|\/api|\/quote|\/order|\/rental-request|\?/,
  );
  expect(new Set(locations).size).toBe(locations.length);

  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.status()).toBe(200);
  const robots = await robotsResponse.text();
  expect(robots).toContain(`Sitemap: ${productionOrigin}/sitemap.xml`);
  expect(robots).toContain('Disallow: /quote');
  expect(robots).not.toContain('Disallow: /rentals');
  expect(robots).not.toMatch(/localhost|127\.0\.0\.1/);
});

test('@seo preserves meaningful responsive content and accessibility at required widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  const category = fixture('SEO_CATEGORY_SLUG');
  const product = fixture('SEO_PRODUCT_IMAGE_SLUG');
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1024 });
    await page.goto(`/rentals/${category}/${product}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeVisible();
    await expectNoSeriousAxeOrOverflow(page);
  }
});
