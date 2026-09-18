import AxeBuilder from '@axe-core/playwright';
import { createGallerySlug } from '@mensah-rentals/validation';
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
  if (
    ['desktop-1024', 'wide-1440', 'xl-1920'].includes(testInfo.project.name)
  ) {
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
      mobile.getByRole('link', { name: 'View All Rentals' }),
    ).toBeVisible();
  }

  await page.goto('/gallery');
  const isMobile = testInfo.project.name.startsWith('mobile-');
  const masonry = page.locator('[data-gallery-masonry]');
  const mobileRows = page.locator('[data-gallery-mobile-row]');
  const activeTiles = isMobile
    ? page.locator('[data-gallery-mobile-primary] [data-gallery-photo-tile]')
    : masonry.locator('[data-gallery-photo-tile]');
  await expect(activeTiles.first()).toBeVisible();
  await expect(activeTiles.filter({ hasText: title }).first()).toBeVisible();
  await expect(page.locator('[data-gallery-load-more]')).toBeVisible();
  if (isMobile) {
    await expect(masonry).toBeHidden();
    await expect(mobileRows).toHaveCount(3);
    await expect(mobileRows.nth(0)).toHaveAttribute('data-direction', 'left');
    await expect(mobileRows.nth(1)).toHaveAttribute('data-direction', 'right');
    await expect(mobileRows.nth(2)).toHaveAttribute('data-direction', 'left');
    for (let index = 0; index < 3; index += 1) {
      const track = mobileRows
        .nth(index)
        .locator('[data-gallery-mobile-track]');
      await expect
        .poll(() =>
          track.evaluate((element) => {
            const style = window.getComputedStyle(element);
            return {
              count: style.animationIterationCount,
              name: style.animationName,
              timing: style.animationTimingFunction,
            };
          }),
        )
        .toMatchObject({ count: 'infinite', timing: 'linear' });
      await expect(
        track.locator('[data-gallery-photo-label]').first(),
      ).toBeVisible();
      await expect(
        track.locator('[data-gallery-visual-clone]'),
      ).toHaveAttribute('aria-hidden', 'true');
      const cloneButtons = track.locator(
        '[data-gallery-visual-clone] [data-gallery-photo-tile]',
      );
      expect(
        await cloneButtons.evaluateAll((buttons) =>
          buttons.every((button) => button.tabIndex === -1),
        ),
      ).toBe(true);
    }
    await mobileRows.nth(0).dispatchEvent('pointerdown');
    await expect(mobileRows.nth(0)).toHaveAttribute('data-paused', 'true');
    await expect
      .poll(() =>
        mobileRows
          .nth(0)
          .locator('[data-gallery-mobile-track]')
          .evaluate(
            (element) => window.getComputedStyle(element).animationPlayState,
          ),
      )
      .toBe('paused');
    await mobileRows.nth(0).dispatchEvent('pointerup');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (let index = 0; index < 3; index += 1) {
      await expect
        .poll(() =>
          mobileRows
            .nth(index)
            .locator('[data-gallery-mobile-track]')
            .evaluate(
              (element) => window.getComputedStyle(element).animationName,
            ),
        )
        .toBe('none');
      await expect(
        mobileRows.nth(index).locator('[data-gallery-visual-clone]'),
      ).toBeHidden();
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  } else {
    await expect(masonry).toBeVisible();
    await expect(mobileRows.first()).toBeHidden();
    const expectedInitial = ['tablet-768', 'desktop-1024'].includes(
      testInfo.project.name,
    )
      ? 9
      : 12;
    await expect.poll(() => activeTiles.count()).toBe(expectedInitial);
    const galleryVisuals = await masonry.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        columnCount: Number(style.columnCount),
        columnGap: Number.parseFloat(style.columnGap),
        overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    expect(galleryVisuals.columnGap).toBeGreaterThanOrEqual(5);
    expect(galleryVisuals.columnGap).toBeLessThanOrEqual(8);
    expect(galleryVisuals.overflows).toBe(false);
    expect(galleryVisuals.columnCount).toBe(
      ['tablet-768', 'desktop-1024'].includes(testInfo.project.name) ? 3 : 4,
    );
  }
  await expect(activeTiles.first()).toHaveCSS('border-radius', '0px');
  await expect(activeTiles.first()).toHaveCSS('box-shadow', 'none');
  await expect(
    activeTiles.first().locator('[data-gallery-photo-label]'),
  ).toBeVisible();
  if (['mobile-390', 'wide-1440'].includes(testInfo.project.name)) {
    await page.screenshot({
      path: testInfo.outputPath(`gallery-${testInfo.project.name}.png`),
      fullPage: true,
    });
    const initialLabels = isMobile
      ? await mobileRows.evaluateAll((rows) =>
          rows.map((row) =>
            Array.from(
              row.querySelectorAll(
                '[data-gallery-mobile-primary] [data-gallery-photo-tile]',
              ),
            ).map((tile) => tile.getAttribute('aria-label')),
          ),
        )
      : await activeTiles.evaluateAll((tiles) =>
          tiles.map((tile) => tile.getAttribute('aria-label')),
        );
    const initialTileCount = await activeTiles.count();
    const loadMore = page.locator('[data-gallery-load-more]');
    await loadMore.click();
    await expect
      .poll(() => activeTiles.count())
      .toBeGreaterThan(initialTileCount);
    if (isMobile) {
      const expandedLabels = await mobileRows.evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(
            row.querySelectorAll(
              '[data-gallery-mobile-primary] [data-gallery-photo-tile]',
            ),
          ).map((tile) => tile.getAttribute('aria-label')),
        ),
      );
      for (const [rowIndex, labels] of initialLabels.entries())
        expect(expandedLabels[rowIndex]?.slice(0, labels.length)).toEqual(
          labels,
        );
    } else {
      const expandedLabels = await activeTiles.evaluateAll((tiles) =>
        tiles.map((tile) => tile.getAttribute('aria-label')),
      );
      expect(expandedLabels.slice(0, initialLabels.length)).toEqual(
        initialLabels,
      );
    }
  }
  if (!isMobile) {
    const imageRatios = await masonry.locator('img').evaluateAll((images) =>
      images.slice(0, 8).map((image) => {
        const element = image as HTMLImageElement;
        const declaredWidth = Number(element.getAttribute('width'));
        const declaredHeight = Number(element.getAttribute('height'));
        return {
          declared: declaredWidth / declaredHeight,
          rendered:
            element.getBoundingClientRect().width /
            element.getBoundingClientRect().height,
        };
      }),
    );
    expect(imageRatios.length).toBeGreaterThan(0);
    for (const ratio of imageRatios) {
      expect(Number.isFinite(ratio.declared)).toBe(true);
      expect(Math.abs(ratio.declared - ratio.rendered)).toBeLessThan(0.02);
    }
  }
  const productHeading = page.getByRole('heading', {
    name: 'Explore rental equipment',
  });
  await expect(productHeading).toBeVisible();
  const productSection = page.locator(
    'section[aria-labelledby="gallery-gear-title"]',
  );
  const productCards = productSection.locator('article');
  expect(await productCards.count()).toBeGreaterThan(4);
  expect(await productCards.count()).toBeLessThanOrEqual(8);
  const productHrefs = await productCards.evaluateAll((cards) =>
    cards.map((card) =>
      card.querySelector('a[href^="/rentals/"]')?.getAttribute('href'),
    ),
  );
  expect(new Set(productHrefs).size).toBe(productHrefs.length);
  for (const href of productHrefs)
    expect(href).toMatch(/^\/rentals\/[a-z0-9-]+\/[a-z0-9-]+$/);
  await expect(productSection).not.toContainText(
    /\$|price|available|remaining|stock|inventory/i,
  );
  await expect(
    page.getByRole('link', { name: /View all rentals/i }),
  ).toHaveAttribute('href', '/rentals');
  const categoryHeading = page.getByRole('heading', {
    name: 'Browse by category',
  });
  await expect(categoryHeading).toBeVisible();
  const productBounds = await productSection.boundingBox();
  const categoryBounds = await categoryHeading.boundingBox();
  expect(categoryBounds?.y).toBeGreaterThan(productBounds?.y ?? 0);
  const categoryRail = page
    .locator('[data-direction="right"]')
    .filter({ has: page.locator('a[href^="/rentals/"]') });
  await expect(categoryRail).toBeVisible();
  await expect(
    categoryRail.locator('a[href^="/rentals/"]').first(),
  ).toHaveAttribute('href', /^\/rentals\/[a-z0-9-]+$/);
  const railTrack = categoryRail.locator('.continuous-rail-track');
  await categoryRail.hover();
  await expect
    .poll(() =>
      railTrack.evaluate(
        (element) => window.getComputedStyle(element).animationPlayState,
      ),
    )
    .toBe('paused');
  await categoryRail.locator('a[href^="/rentals/"]').first().focus();
  await expect
    .poll(() =>
      railTrack.evaluate(
        (element) => window.getComputedStyle(element).animationPlayState,
      ),
    )
    .toBe('paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      railTrack.evaluate(
        (element) => window.getComputedStyle(element).animationName,
      ),
    )
    .toBe('none');
  await expect(categoryRail.locator('.continuous-rail-clone')).toBeHidden();
  if (testInfo.project.name.startsWith('mobile-')) {
    expect(
      await categoryRail.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute(
    'content',
    /noindex/i,
  );

  await page.getByRole('link', { name: 'Events & Festivals' }).click();
  await expect(page).toHaveURL(/\/gallery\?type=events-festivals$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/i,
  );
  const filteredTiles = isMobile
    ? page.locator('[data-gallery-mobile-primary] [data-gallery-photo-tile]')
    : page
        .locator('[data-gallery-masonry]')
        .locator('[data-gallery-photo-tile]');
  const firstTile = filteredTiles.first();
  await expect(firstTile).toBeVisible();
  const filteredCount = await filteredTiles.count();
  expect(filteredCount).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-gallery-load-more]')).toHaveCount(0);
  if (isMobile) {
    await expect(page.locator('[data-gallery-mobile-track]').first()).toHaveCSS(
      'animation-name',
      'none',
    );
    await expect(page.locator('[data-gallery-visual-clone]')).toHaveCount(0);
  }
  const firstPhoto = firstTile.locator('img');
  const firstAlt = await firstPhoto.getAttribute('alt');
  await firstTile.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`1 / ${filteredCount}`);
  await dialog.getByRole('button', { name: 'Next photo' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`2 / ${filteredCount}`);
  await expect(dialog.locator('img')).not.toHaveAttribute('alt', firstAlt!);
  const secondAlt = await dialog.locator('img').getAttribute('alt');
  await dialog.getByRole('button', { name: 'Next photo' }).click();
  await expect(dialog).toContainText(`3 / ${filteredCount}`);
  await expect(dialog.locator('img')).not.toHaveAttribute('alt', secondAlt!);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog).toContainText(`2 / ${filteredCount}`);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog).toContainText(`1 / ${filteredCount}`);
  await dialog.getByRole('button', { name: 'Previous photo' }).click();
  await expect(dialog).toContainText(`${filteredCount} / ${filteredCount}`);
  await dialog.getByRole('button', { name: 'Next photo' }).click();
  await expect(dialog).toContainText(`1 / ${filteredCount}`);
  const buttonSizes = await dialog.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => ({
      height: button.getBoundingClientRect().height,
      width: button.getBoundingClientRect().width,
      zIndex: Number(window.getComputedStyle(button).zIndex) || 0,
    })),
  );
  expect(
    buttonSizes.every(({ height, width }) => height >= 44 && width >= 44),
  ).toBe(true);
  expect(buttonSizes.slice(1).every(({ zIndex }) => zIndex >= 10)).toBe(true);
  if (testInfo.project.name.startsWith('mobile-')) {
    const imageRegion = dialog.locator('.touch-pan-y');
    await imageRegion.dispatchEvent('touchstart', {
      changedTouches: [{ clientX: 260, clientY: 320, identifier: 1 }],
    });
    await imageRegion.dispatchEvent('touchend', {
      changedTouches: [{ clientX: 120, clientY: 325, identifier: 1 }],
    });
    await expect(dialog).toContainText(`2 / ${filteredCount}`);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(firstTile).toBeFocused();

  await page.goto(`/gallery/${slug}`);
  await expect(page).toHaveURL(`/gallery?event=${slug}`);
  await expect(
    page.getByRole('heading', { level: 2, name: title }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`Open ${title}`) })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(
    `1 / ${required('PHASE192_EVENT_PHOTO_COUNT')}`,
  );
  await page.getByRole('button', { name: 'Previous photo' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    `${required('PHASE192_EVENT_PHOTO_COUNT')} / ${required('PHASE192_EVENT_PHOTO_COUNT')}`,
  );
  await expect(page.getByRole('dialog')).toContainText(title);
  await page.getByRole('button', { name: 'Close Gallery viewer' }).click();
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

test('@gallery-homepage-launch-flow creates and publishes a Gallery project with generated slug and WebP preview', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'wide-1440');
  await login(page);
  await page.goto('http://localhost:3001/website/gallery/new');

  await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  const titleField = page.locator('#title');
  const slugField = page.locator('#slug');
  await expect(titleField).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a project title.')).toBeVisible();
  await expect(titleField).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('gallery-validation-error.png'),
    fullPage: true,
  });

  const title = required('PHASE192_GALLERY_TITLE');
  const generatedSlug = createGallerySlug(title);
  await titleField.fill(title);
  await expect(slugField).toHaveValue(generatedSlug);
  await slugField.fill('manual-gallery-url');
  await titleField.fill(`${title} changed`);
  await expect(slugField).toHaveValue('manual-gallery-url');
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(slugField).toHaveValue(`${generatedSlug}-changed`);
  await titleField.fill(title);
  await expect(slugField).toHaveValue(generatedSlug);
  await page
    .getByLabel('Short description')
    .fill('A polished Gallery CMS browser verification project.');

  await page.getByRole('button', { name: 'Add image' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker).toBeVisible();
  const preview = picker.locator('img').first();
  await expect(preview).toBeVisible();
  const previewSource = await preview.getAttribute('src');
  expect(previewSource).toBeTruthy();
  expect(new URL(previewSource!, page.url()).pathname).toMatch(
    /^\/api\/homepage\/media\/.+\.webp$/,
  );
  await expect
    .poll(() =>
      preview.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath('gallery-media-picker-webp.png'),
    fullPage: true,
  });
  await picker.getByRole('button', { name: 'Use this image' }).first().click();
  await expect(page.getByText('Images 1 / 20')).toBeVisible();

  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/website\/gallery\/[a-z0-9]+$/);
  await expect(slugField).toHaveValue(generatedSlug);
  await page.screenshot({
    path: testInfo.outputPath('gallery-editor-saved.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(
    page.getByRole('button', { name: 'Publishing...' }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://localhost:3001/website/gallery');
  await expect(page.getByText('Gallery project published.')).toBeVisible();
  await page.goto(`http://localhost:3000/gallery?event=${generatedSlug}`);
  await expect(
    page.getByRole('heading', { level: 2, name: title }),
  ).toBeVisible();
  await expectAccessible(page);
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
