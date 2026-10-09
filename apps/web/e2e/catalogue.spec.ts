import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const responsiveProjects = new Set(['mobile-320', 'tablet-768', 'wide-1440']);

test('@catalogue catalogue reflows and passes light accessibility checks', async ({
  page,
}, testInfo) => {
  test.skip(!responsiveProjects.has(testInfo.project.name));
  await page.goto('/rentals');
  await expect(
    page.getByRole('heading', { name: /equipment for events/i }),
  ).toBeVisible();
  const hero = page.locator('[data-rentals-hero="true"]');
  await expect(hero).toBeVisible();
  const heroLayout = await hero.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const heading = element.querySelector<HTMLElement>('h1');
    const headingBox = heading?.getBoundingClientRect();
    return {
      contentLeft: headingBox?.left,
      left: box.left,
      right: box.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(heroLayout.left).toBeCloseTo(0, 0);
  expect(heroLayout.right).toBeCloseTo(heroLayout.viewportWidth, 0);
  expect(heroLayout.contentLeft).toBeGreaterThanOrEqual(16);
  await expect(
    hero.getByRole('link', { name: 'Browse categories' }),
  ).toHaveAttribute('href', '#catalogue-categories');
  const heroControls = hero.getByRole('group', {
    name: 'Catalogue hero controls',
  });
  if ((await heroControls.count()) > 0) {
    await expect(heroControls).toBeVisible();
    await expect(
      hero.getByRole('button', { name: 'Pause catalogue slideshow' }),
    ).toBeVisible();
  }
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

test('@catalogue 320px catalogue remains accessible in dark mode', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  await page.goto('/rentals');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('@catalogue keyboard users reach the skip link and controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByLabel('Search equipment')).toBeVisible();
});

test('@catalogue combined filters remain server-backed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.getByLabel('Search equipment').fill('chair');
  await page.getByLabel('Sort by').selectOption('name-desc');
  await page.getByLabel('Featured only').check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/search=chair/);
  await expect(page).toHaveURL(/featured=true/);
  await expect(page).toHaveURL(/sort=name-desc/);
});

test('@catalogue manual theme persists and product details expose no stock claims', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  await page.goto('/rentals');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const productHref = await page
    .locator('article a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(productHref).toBeTruthy();
  await page.goto(productHref!);
  await expect(
    page.getByRole('region', { name: /image gallery/i }),
  ).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(
    /only \d+ left|\d+ (available|remaining)|total quantity|asset number|serial number|reserved quantity/i,
  );
});

test('@catalogue Phase 19.2.4 category discovery and product flow remain responsive', async ({
  page,
}, testInfo) => {
  test.skip(!['mobile-320', 'wide-1440'].includes(testInfo.project.name));
  await page.goto('/rentals');
  await expect(page.getByLabel('Sort by')).toHaveValue('newest');
  const showcase = page.locator(
    '[data-homepage-section="featured-categories"]',
  );
  await expect(showcase).toBeVisible();
  await expect(showcase.locator('ul')).toHaveCSS('display', 'flex');
  expect(await showcase.locator('li').count()).toBeGreaterThan(1);
  expect(await showcase.innerText()).not.toMatch(
    /\$\d|% off|available quantity|remaining stock|in stock/i,
  );

  const categoryHref = await showcase
    .locator('li a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(categoryHref).toMatch(/^\/rentals\/[^/]+$/);
  await page.goto(categoryHref!);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);

  await page.goto('/rentals');
  const productHref = await page
    .locator('article a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(productHref).toBeTruthy();
  await page.goto(productHref!);
  const layout = await page.evaluate(() => {
    const gallery = document.querySelector<HTMLElement>(
      '[aria-label*="image gallery"]',
    );
    const heading = document.querySelector<HTMLElement>('main h1');
    const rentalUnit = Array.from(document.querySelectorAll('dt')).find(
      (element) => element.textContent?.trim() === 'Rental unit',
    ) as HTMLElement | undefined;
    const quoteMethod = Array.from(document.querySelectorAll('dt')).find(
      (element) => element.textContent?.trim() === 'Quote method',
    ) as HTMLElement | undefined;
    const action = Array.from(document.querySelectorAll('h2')).find((element) =>
      element.textContent?.includes('How this rental is confirmed'),
    ) as HTMLElement | undefined;
    return {
      galleryBottom: gallery?.getBoundingClientRect().bottom,
      headingLeft: heading?.getBoundingClientRect().left,
      headingTop: heading?.getBoundingClientRect().top,
      rentalTop: rentalUnit?.getBoundingClientRect().top,
      quoteTop: quoteMethod?.getBoundingClientRect().top,
      actionLeft: action?.getBoundingClientRect().left,
      actionTop: action?.getBoundingClientRect().top,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.headingTop).toBeGreaterThan(layout.galleryBottom!);
  expect(layout.rentalTop).toBeGreaterThan(layout.headingTop!);
  expect(layout.quoteTop).toBeGreaterThanOrEqual(layout.rentalTop!);
  if (testInfo.project.name === 'wide-1440')
    expect(layout.actionLeft).toBeGreaterThan(layout.headingLeft!);
  else expect(layout.actionTop).toBeGreaterThan(layout.quoteTop!);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(
      `phase-19-2-4-product-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
