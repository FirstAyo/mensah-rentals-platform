import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Response } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

async function captureAuditScreenshot(page: Page, filename: string) {
  const directory =
    process.env.PHASE19_2_1_SCREENSHOT_DIR ??
    join(tmpdir(), 'mensah-phase19-2-1');
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: join(directory, filename),
  });
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
  const primaryNavigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const rentalsMenuButton = primaryNavigation.getByRole('button', {
    name: 'Rentals',
  });
  await rentalsMenuButton.focus();
  await rentalsMenuButton.press('Enter');
  const rentalsMenu = page.locator('#rentals-mega-menu');
  await expect(rentalsMenu).toBeVisible();
  await rentalsMenu.getByRole('link', { name: 'View All Rentals' }).click();
  await expect(page).toHaveURL(/\/rentals$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Equipment for events',
  );

  await page.getByRole('link', { name: 'Mensah Rentals' }).first().click();
  await page.getByRole('link', { name: 'Browse rental equipment' }).click();
  await expect(page).toHaveURL(/\/rentals$/);
  const catalogueNavigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  await catalogueNavigation.getByRole('button', { name: 'Rentals' }).click();
  const categoryLinks = page.locator('#rentals-mega-menu a[href^="/rentals/"]');
  const categoryHref = await categoryLinks.evaluateAll((links) =>
    links
      .map((link) => new URL((link as HTMLAnchorElement).href).pathname)
      .find((pathname) => pathname.split('/').filter(Boolean).length === 2),
  );
  expect(categoryHref).toBeTruthy();
  const categoryLink = page
    .locator(`#rentals-mega-menu a[href="${categoryHref}"]`)
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
  await page.getByRole('link', { name: 'Send rental enquiry' }).click();
  await expect(page).toHaveURL(/\/cart\/enquiry$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tell us what your project needs',
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

test('@public-navigation provides intent-aware premium desktop mega-menu interaction', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await page.goto('/');
  await page.mouse.move(10, 850);
  await page.waitForTimeout(400);

  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const trigger = navigation.getByRole('button', { name: 'Rentals' });
  const panel = page.locator('#rentals-mega-menu');
  await expect(panel).toHaveCount(0);

  await trigger.hover();
  await page.waitForTimeout(70);
  await expect(panel).toHaveCount(0);
  await navigation.getByRole('link', { name: 'Gallery' }).hover();
  await page.waitForTimeout(110);
  await expect(panel).toHaveCount(0);

  await trigger.hover();
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('data-state', 'open');
  const openStyle = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    const content = element.querySelector<HTMLElement>(
      '[data-mega-menu-content="true"]',
    );
    const contentStyle = content ? getComputedStyle(content) : null;
    return {
      backgroundColor: style.backgroundColor,
      duration: style.transitionDuration,
      maxWidth: contentStyle?.maxWidth,
      opacity: style.opacity,
    };
  });
  expect(openStyle.backgroundColor).toMatch(/^rgb\(|^rgba\(|^color\(/);
  const modernAlpha =
    openStyle.backgroundColor.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
  const legacyAlpha = openStyle.backgroundColor.match(
    /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/,
  )?.[1];
  const surfaceAlpha = Number(modernAlpha ?? legacyAlpha ?? 1);
  expect(surfaceAlpha).toBeGreaterThanOrEqual(0.9);
  expect(surfaceAlpha).toBeLessThanOrEqual(0.96);
  expect(openStyle.duration).toContain('0.2s');
  expect(openStyle.maxWidth).toBe('1440px');
  expect(Number(openStyle.opacity)).toBe(1);

  await panel.hover();
  await page.waitForTimeout(300);
  await expect(panel).toHaveAttribute('data-state', 'open');

  await page.mouse.move(10, 850);
  await page.waitForTimeout(50);
  await expect(panel).toHaveAttribute('data-state', 'open');
  await trigger.hover();
  await page.waitForTimeout(280);
  await expect(panel).toHaveAttribute('data-state', 'open');

  await page.mouse.move(10, 850);
  await page.waitForTimeout(270);
  await expect(panel).toHaveClass(/duration-150/);
  await expect(panel).toHaveCount(0, { timeout: 500 });

  await trigger.focus();
  await trigger.press('Enter');
  await expect(panel).toBeVisible();
  await trigger.press('Tab');
  await expect(
    panel.getByRole('link', { name: 'View All Rentals' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(panel).toBeVisible();
  await page.mouse.click(10, 850);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(panel).toBeVisible();
  expect(
    await panel.evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    ),
  ).toBe('opacity');
  await expectNoOverflowOrSeriousAxe(page);

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 });
    await page.reload();
    await page.mouse.move(10, width === 1440 ? 850 : 1030);
    await trigger.hover();
    await expect(panel).toBeVisible();
    await captureAuditScreenshot(page, `${width}-mega-menu-open.png`);
  }
});

test('@public-navigation constrains public content while preserving full-bleed sections at every target width', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560];

  for (const width of widths) {
    await page.setViewportSize({
      width,
      height: width <= 430 ? 844 : width <= 1024 ? 900 : 1080,
    });
    await page.goto('/');
    const measurements = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>('[data-homepage-hero]');
      const container = hero?.querySelector<HTMLElement>('.public-container');
      const services = document.querySelector<HTMLElement>(
        '[data-homepage-section="services"]',
      );
      const featuredCategories = document.querySelector<HTMLElement>(
        '[data-homepage-section="featured-categories"]',
      );
      const recentWork = document.querySelector<HTMLElement>(
        '[data-homepage-section="recent-work"]',
      );
      const heroBox = hero?.getBoundingClientRect();
      const containerBox = container?.getBoundingClientRect();
      const servicesBox = services?.getBoundingClientRect();
      const featuredCategoriesBox = featuredCategories?.getBoundingClientRect();
      const recentWorkBox = recentWork?.getBoundingClientRect();
      const servicesStyle = services ? getComputedStyle(services) : null;
      return {
        container: containerBox
          ? {
              left: containerBox.left,
              right: containerBox.right,
              width: containerBox.width,
            }
          : null,
        hero: heroBox
          ? { left: heroBox.left, right: heroBox.right, width: heroBox.width }
          : null,
        categoriesBeforeServices:
          servicesBox && featuredCategoriesBox
            ? featuredCategoriesBox.top < servicesBox.top
            : null,
        servicesToRecentWorkGap:
          servicesBox && recentWorkBox
            ? recentWorkBox.top - servicesBox.bottom
            : null,
        servicesBottomPadding: Number.parseFloat(
          servicesStyle?.paddingBottom ?? '0',
        ),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(measurements.scrollWidth).toBeLessThanOrEqual(
      measurements.viewportWidth + 1,
    );
    expect(measurements.hero).not.toBeNull();
    expect(measurements.hero!.left).toBeCloseTo(0, 0);
    expect(measurements.hero!.right).toBeCloseTo(width, 0);
    expect(measurements.container).not.toBeNull();
    expect(measurements.container!.width).toBeLessThanOrEqual(1440.5);
    expect(
      Math.abs(
        measurements.container!.left - (width - measurements.container!.right),
      ),
    ).toBeLessThanOrEqual(1);
    expect(measurements.categoriesBeforeServices).toBe(true);
    expect(
      Math.abs(measurements.servicesToRecentWorkGap ?? 99),
    ).toBeLessThanOrEqual(1);
    expect(measurements.servicesBottomPadding).toBe(
      width >= 1024 ? 56 : width >= 640 ? 64 : 48,
    );

    if ([390, 1440, 1920, 2560].includes(width))
      await captureAuditScreenshot(page, `${width}-homepage.png`);
  }
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
  const mobileNavigation = page.getByRole('navigation', {
    name: 'Mobile navigation',
  });
  await mobileNavigation.getByText('Rentals', { exact: true }).click();
  await mobileNavigation
    .getByRole('link', { name: 'View All Rentals' })
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
