import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  if (process.env.MENSAH_ISOLATED_E2E !== 'verified-local-test-database')
    throw new Error(
      'Homepage browser tests require the guarded isolated test database.',
    );
  if (/@homepage-(?:admin|media)/.test(testInfo.title)) {
    await page.goto('http://localhost:3001/login');
    await page.getByLabel(/email/i).fill(process.env.STAFF_BOOTSTRAP_EMAIL!);
    await page
      .getByLabel(/password/i)
      .fill(process.env.STAFF_BOOTSTRAP_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('http://localhost:3001/');
  }
});

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

function assignment(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
}

async function uploadAndAssign(
  page: Page,
  label: string,
  name: string,
  buffer: Buffer,
) {
  const field = assignment(page, label);
  await field
    .getByRole('button', { name: /choose image|replace image/i })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Upload new image').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
  await expect(
    page.getByText("Image uploaded. Select 'Use this image' to assign it."),
  ).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Use this image' }).first().click();
  await expect(page.getByText(`Image selected for ${label}.`)).toBeVisible();
  await expect(field.getByText(`Selected for ${label}`)).toBeVisible();
}

async function saveFromBottom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page
    .getByRole('button', { name: /save draft/i })
    .last()
    .click();
  await expect(
    page.getByText('Draft saved. Published content is unchanged.', {
      exact: true,
    }),
  ).toBeVisible();
}

async function publishSavedDraftFromBottom(page: Page) {
  await page
    .getByRole('button', { name: /^Publish$/ })
    .last()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/Homepage published/i)).toBeVisible();
}

async function publishFromBottom(page: Page) {
  await saveFromBottom(page);
  await publishSavedDraftFromBottom(page);
}

test('@homepage-public renders premium request-based content at 320px with dark-theme persistence and no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Browse rental equipment' }),
  ).toHaveAttribute('href', '/rentals');
  await expect(
    page.getByRole('link', { name: 'Track a request' }),
  ).toHaveAttribute('href', '/track-request');
  await expect(
    page.getByRole('link', { name: 'View rental cart' }),
  ).toHaveAttribute('href', '/cart');
  await expect(page.getByText('Staff-reviewed quotes')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expectNoSeriousAxeViolations(page);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.content()).not.toMatch(
    /available quantity|remaining stock|reserved quantity|serial number/i,
  );
});

test('@homepage-public renders safely when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('@homepage-admin provides responsive fixed navigation, consistent controls, and a three-slide publish flow', async ({
  page,
}, testInfo) => {
  await page.goto('http://localhost:3001/website/homepage');
  await expect(
    page.getByRole('heading', { name: 'Homepage', exact: true }),
  ).toBeVisible();

  if (testInfo.project.name === 'mobile-320') {
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(
      page.getByRole('button', { name: /save draft/i }).last(),
    ).toBeVisible();
    const sizes = await page.evaluate(() => ({
      input: document
        .querySelector('main input:not([type="checkbox"])')
        ?.getBoundingClientRect().height,
      textarea: document.querySelector('main textarea')?.getBoundingClientRect()
        .height,
      resize: document.querySelector('main textarea')
        ? getComputedStyle(document.querySelector('main textarea')!).resize
        : '',
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    }));
    expect(sizes.input).toBe(44);
    expect(sizes.textarea).toBeGreaterThanOrEqual(104);
    expect(sizes.resize).toBe('vertical');
    expect(sizes.overflow).toBe(true);
    await expectNoSeriousAxeViolations(page);
    return;
  }

  const sidebar = page.locator('aside').first();
  await expect(sidebar).toHaveCSS('position', 'fixed');
  const sidebarTop = await sidebar.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await page.evaluate(() => window.scrollTo(0, 900));
  expect(
    await sidebar.evaluate((element) => element.getBoundingClientRect().top),
  ).toBe(sidebarTop);
  await page.evaluate(() => window.scrollTo(0, 0));

  const images: Buffer[] = [];
  for (const position of [0, 700, 1400]) {
    await page.evaluate((top) => window.scrollTo(0, top), position);
    images.push(await page.screenshot());
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let index = 0; index < 3; index += 1)
    await uploadAndAssign(
      page,
      `Hero Slide ${index + 1}`,
      `phase16-4a-hero-${index + 1}.png`,
      images[index]!,
    );

  await expect(
    page.getByText(/3 slides configured.*3 enabled.*3 images assigned/i),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move earlier' }).last().click();
  await page.getByLabel('Overlay intensity').selectOption('STRONG');
  await page.getByLabel('Heading').first().fill('Three-image premium homepage');
  await saveFromBottom(page);

  const previewLink = page.getByRole('link', { name: /preview/i }).last();
  const [preview] = await Promise.all([
    page.waitForEvent('popup'),
    previewLink.click(),
  ]);
  await expect(
    preview.getByRole('button', { name: 'Next hero image' }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Next hero image' }).click();
  await preview.getByRole('button', { name: 'Next hero image' }).click();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/i,
  );
  await preview.close();
  await publishSavedDraftFromBottom(page);

  await page.goto('http://localhost:3000/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Three-image premium homepage',
  );
  await expect(
    page.locator('button[aria-label^="Show hero image"]'),
  ).toHaveCount(3);
  const selectedBefore = await page
    .locator('button[aria-current="true"]')
    .getAttribute('aria-label');
  await page.getByRole('button', { name: 'Next hero image' }).click();
  expect(
    await page
      .locator('button[aria-current="true"]')
      .getAttribute('aria-label'),
  ).not.toBe(selectedBefore);
  await page.getByRole('button', { name: 'Previous hero image' }).click();
  await page.getByRole('button', { name: 'Pause hero images' }).click();
  await expect(
    page.getByRole('button', { name: 'Play hero images' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);

  await page.setViewportSize({ width: 320, height: 720 });
  const indicatorTargets = await page
    .locator('button[aria-label^="Show hero image"]')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
    );
  expect(indicatorTargets).toHaveLength(3);
  expect(
    indicatorTargets.every(({ width, height }) => width >= 44 && height >= 44),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Play hero images' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionBefore = await page
    .locator('button[aria-current="true"]')
    .getAttribute('aria-label');
  await page.waitForTimeout(8_000);
  await expect(page.locator('button[aria-current="true"]')).toHaveAttribute(
    'aria-label',
    reducedMotionBefore!,
  );
  await page.getByRole('button', { name: 'Next hero image' }).click();
  expect(
    await page
      .locator('button[aria-current="true"]')
      .getAttribute('aria-label'),
  ).not.toBe(reducedMotionBefore);
  await expectNoSeriousAxeViolations(page);
});

test('@homepage-media reuses product media, assigns a category cover, and preserves fallback behaviour', async ({
  page,
}, testInfo) => {
  const productLabel = process.env.PHASE16_4A_PRODUCT_IMAGE_LABEL!;
  const categoryId = process.env.PHASE16_4A_CATEGORY_ID!;
  const categoryName = process.env.PHASE16_4A_CATEGORY_NAME!;

  await page.goto('http://localhost:3001/website/homepage');
  if (testInfo.project.name === 'mobile-320') {
    await assignment(page, 'Hero Slide 1')
      .getByRole('button', { name: /choose image|replace image/i })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Product images' }).click();
    await dialog.getByLabel('Search media').fill(productLabel);
    await expect(dialog.getByText(productLabel).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoSeriousAxeViolations(page);
    return;
  }

  await assignment(page, 'Hero Slide 1')
    .getByRole('button', { name: /choose image|replace image/i })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Product images' }).click();
  await dialog.getByLabel('Search media').fill(productLabel);
  await expect(dialog.getByText(productLabel).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Use this image' }).click();
  await expect(
    page.getByText('Image selected for Hero Slide 1.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /save draft/i })
    .last()
    .click();
  await expect(
    page.getByText('Draft saved. Published content is unchanged.', {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto(`http://localhost:3001/categories/${categoryId}/edit`);
  await assignment(page, 'Category cover')
    .getByRole('button', { name: /choose image/i })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Product images' }).click();
  await dialog.getByLabel('Search media').fill(productLabel);
  await dialog.getByRole('button', { name: 'Use this image' }).click();
  await page.getByLabel('Alt text').fill(`${categoryName} equipment cover`);
  await page.getByRole('button', { name: 'Save category cover' }).click();
  await expect(page.getByText('Category cover saved.')).toBeVisible();
  await expect(
    page.getByText(/current resolved source: category cover/i),
  ).toBeVisible();

  await page.goto('http://localhost:3001/website/homepage');
  const categoryCheckbox = page.getByRole('checkbox', { name: categoryName });
  if (!(await categoryCheckbox.isChecked())) await categoryCheckbox.check();
  await publishFromBottom(page);
  const response = await page.request.get(
    'http://localhost:4000/public/homepage',
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    categories: Array<{ name: string; image: { source: string } }>;
  };
  expect(
    body.categories.find((category) => category.name === categoryName)?.image
      .source,
  ).toBe('CATEGORY_COVER');
  expect(JSON.stringify(body)).not.toMatch(
    /storagePath|contentHash|permission|inventory|availableQuantity|serialNumber/i,
  );
});

test('@homepage @homepage-google-fallback shows a truthful fallback without fake reviews or ratings', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /See what customers share on Google/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Google review links will appear/i),
  ).toBeVisible();
  expect(await page.content()).not.toMatch(
    /aggregateRating|reviewRating|five-star/i,
  );
});

test('@homepage-google-live renders live Google reviews, attribution and accessible responsive cards', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('4.8', { exact: true })).toBeVisible();
  await expect(page.getByText(/42 Google Maps reviews/i)).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Google Maps customer reviews' })
      .getByRole('article'),
  ).toHaveCount(3);
  await expect(page.getByText('Test-owned Google review 1')).toBeVisible();
  await expect(page.getByText('Test Reviewer 1')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /View this review on Google Maps/i }),
  ).toHaveCount(3);
  await expect(page.getByLabel('Google Maps attribution')).toBeVisible();
  await expect(
    page.getByText(/selected and ordered by Google Maps based on relevance/i),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('Test-owned Google review 1')).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const html = await page.content();
  expect(html).not.toMatch(
    /test-owned-server-key|ChIJE2EGoogleReviews|inventoryQuantity|reservation|staffSession/i,
  );
});

test('@homepage-google-live lets authorized staff inspect and test the connection without exposing secrets', async ({
  page,
}) => {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(process.env.STAFF_BOOTSTRAP_EMAIL!);
  await page
    .getByLabel(/password/i)
    .fill(process.env.STAFF_BOOTSTRAP_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
  await page.goto('http://localhost:3001/website/homepage');
  await expect(
    page.getByRole('heading', { name: 'Google Reviews connection' }),
  ).toBeVisible();
  await expect(page.getByText('Configuration status: READY')).toBeVisible();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(
    page.getByText('Google Places connection succeeded.'),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('Google Reviews connection')
      .getByText('Mensah Rentals', { exact: true }),
  ).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/test-owned-server-key|ChIJE2EGoogleReviews/);
});

test('@homepage-google-timeout preserves the truthful fallback after timeout', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /See what customers share on Google/i }),
  ).toBeVisible();
  await expect(page.getByText(/Open our Google profile/i)).toBeVisible();
  expect(await page.content()).not.toMatch(/out of 5|Test Reviewer/);
});

test('@homepage-google-quota preserves the truthful fallback after quota response', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /See what customers share on Google/i }),
  ).toBeVisible();
  await expect(page.getByText(/Open our Google profile/i)).toBeVisible();
  expect(await page.content()).not.toMatch(/out of 5|Test Reviewer/);
});
