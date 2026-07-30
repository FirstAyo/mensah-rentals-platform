import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 360_000 });

function credential(
  name: 'STAFF_BOOTSTRAP_EMAIL' | 'STAFF_BOOTSTRAP_PASSWORD',
) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the isolated order harness.`);
  return value;
}

function future(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((entry) =>
      ['critical', 'serious'].includes(entry.impact ?? ''),
    ),
  ).toEqual([]);
}

async function createAcceptedQuote(
  page: Page,
  productIndex = 0,
  desiredQuantity = 3,
  fulfillmentMethod: 'PICKUP' | 'DELIVERY' = 'PICKUP',
  productName?: string,
) {
  const approvedRequestId = process.env.PHASE121_APPROVED_REQUEST_ID;
  let marker = process.env.PHASE121_PROJECT_NAME ?? '';
  let reference = process.env.PHASE121_REQUEST_REFERENCE ?? '';
  if (approvedRequestId) {
    await page.goto('http://localhost:3001/login');
    await page.getByLabel(/email/i).fill(credential('STAFF_BOOTSTRAP_EMAIL'));
    await page
      .getByLabel(/password/i)
      .fill(credential('STAFF_BOOTSTRAP_PASSWORD'));
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('http://localhost:3001/', {
      timeout: 30_000,
    });
    await page.goto(
      `http://localhost:3001/rental-requests/${approvedRequestId}`,
    );
    await expect(
      page.getByRole('link', { name: 'Create quote' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Create quote' }).click();
  } else {
    await page.goto('http://localhost:3000/rentals');
    const productCard = productName
      ? page.locator('article').filter({ hasText: productName }).first()
      : page.locator('article').nth(productIndex);
    const productHref = await productCard
      .locator('a[href^="/rentals/"]')
      .first()
      .getAttribute('href');
    expect(productHref).toBeTruthy();
    await page.goto(`http://localhost:3000${productHref}`);
    await page.getByLabel('Desired quantity').fill(desiredQuantity.toString());
    await page.getByRole('button', { name: 'Add to rental cart' }).click();
    await expect(
      page.getByRole('link', { name: 'Rental cart, 1 equipment type' }),
    ).toBeVisible({ timeout: 90_000 });
    await page.goto('http://localhost:3000/cart');
    await page
      .getByRole('link', { name: 'Continue to rental request' })
      .click();

    marker = `E2E-P12-${Date.now()}`;
    await page.getByLabel('First name').fill('Order');
    await page.getByLabel('Last name').fill('Customer');
    await page.getByLabel('Email').fill(`${marker.toLowerCase()}@example.test`);
    await page.getByLabel('Phone').fill('+233 20 000 0012');
    await page.getByLabel('Project or event name').fill(marker);
    await page.getByLabel('Project or event type').fill('Order browser test');
    await page.getByLabel('Rental start date').fill(future(7));
    await page.getByLabel('Rental end date').fill(future(9));
    await page.getByLabel('Project or event location').fill('Accra');
    if (fulfillmentMethod === 'DELIVERY') {
      await page.getByLabel('Delivery', { exact: true }).check();
      await page.getByLabel('Delivery address').fill('15 Phase Street, Accra');
    }
    await page.getByRole('button', { name: 'Review request' }).click();
    await page.getByRole('button', { name: 'Submit rental request' }).click();
    await expect(page).toHaveURL(/rental-requests\/MR-/, { timeout: 90_000 });
    reference = (await page.getByText(/Reference:/).innerText())
      .replace('Reference:', '')
      .trim();

    await page.goto('http://localhost:3001/login');
    await page.getByLabel(/email/i).fill(credential('STAFF_BOOTSTRAP_EMAIL'));
    await page
      .getByLabel(/password/i)
      .fill(credential('STAFF_BOOTSTRAP_PASSWORD'));
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('http://localhost:3001/', { timeout: 30_000 });
    await page.goto('http://localhost:3001/rental-requests');
    await page.getByLabel('Search requests').fill(reference);
    await page.getByRole('link', { name: reference, exact: true }).click();
    await page.getByRole('button', { name: 'Start review' }).click();
    await page
      .getByLabel('Internal reason', { exact: true })
      .fill('P12 isolated confirmed-order fixture');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm decision' }).click();
    await page.getByRole('link', { name: 'Create quote' }).click();
  }

  const unitPrices = page.getByLabel('Unit price (CAD)');
  await expect(unitPrices.first()).toBeVisible({ timeout: 90_000 });
  for (let index = 0; index < (await unitPrices.count()); index += 1)
    await unitPrices.nth(index).fill('125.50');
  await page.getByLabel('Discount (CAD)').fill('5.00');
  await page.getByLabel('Tax rate (%)').fill('5');
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 5);
  await page
    .getByLabel(/Valid until/)
    .fill(validUntil.toISOString().slice(0, 16));
  await page.getByLabel('Customer notes').fill('Customer-visible order note');
  await page.getByLabel('Internal notes').fill('PRIVATE-P12-SENTINEL');
  await page.getByLabel('Terms').fill('Confirmed rental order terms.');
  await page.getByRole('button', { name: 'Create draft quote' }).click();
  await expect(page).toHaveURL(/\/quotes\//);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Send current revision' }).click();
  const quoteLink = await page
    .getByRole('heading', { name: 'Secure customer link' })
    .locator('..')
    .locator('code')
    .innerText();
  const adminQuoteUrl = page.url();

  const capability = new URL(quoteLink).hash.replace('#capability=', '');
  const exchange = await page.request.post(
    'http://localhost:3000/api/quote/access',
    {
      data: { capability },
      headers: { Origin: 'http://localhost:3000' },
    },
  );
  expect(exchange.ok()).toBe(true);
  await page.goto('http://localhost:3000/quote');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Accept quote' }).click();
  await expect(page.getByText(/accepted and no longer/i)).toBeVisible();
  await page.goto(adminQuoteUrl);
  await expect(
    page.getByRole('button', { name: 'Create rental order' }),
  ).toBeVisible();

  return { marker, reference };
}

async function createOrder(
  page: Page,
  productIndex = 0,
  desiredQuantity = 3,
  fulfillmentMethod: 'PICKUP' | 'DELIVERY' = 'PICKUP',
  productName?: string,
) {
  const fixture = await createAcceptedQuote(
    page,
    productIndex,
    desiredQuantity,
    fulfillmentMethod,
    productName,
  );
  await page.getByRole('button', { name: 'Create rental order' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/does not reserve inventory/i)).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Confirm and create order' })
    .click();
  const created = page.getByRole('heading', { name: 'Rental order created' });
  await expect(created).toBeVisible();
  await created
    .locator('..')
    .getByRole('link', { name: /Open RO-/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Private customer access' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Generate customer link' }).click();
  const customerLinkSection = page
    .getByText('Secure link shown for this action only')
    .locator('..');
  await expect(customerLinkSection).toBeVisible();
  const customerLink = await customerLinkSection.locator('code').innerText();
  const orderNumber = (
    await page.getByRole('heading', { name: /^RO-/ }).innerText()
  ).trim();
  const orderId = new URL(page.url()).pathname
    .split('/')
    .filter(Boolean)
    .at(-1);
  expect(orderId).toBeTruthy();
  return { ...fixture, customerLink, orderId: orderId!, orderNumber };
}

function reservationPanel(page: Page) {
  return page.locator('section[aria-labelledby="reservation-heading"]');
}

async function reserveCurrentOrderInFull(page: Page) {
  const panel = reservationPanel(page);
  await panel
    .getByRole('button', { name: 'Check availability and reserve' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Confirm full reservation' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Reserve in full' }).click();
  await expect(panel.getByText('Reserved', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function reserveCurrentOrderPartially(page: Page, reason: string) {
  const panel = reservationPanel(page);
  await panel
    .getByRole('button', { name: 'Check availability and reserve' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', {
      name: 'Full reservation is not currently possible.',
    }),
  ).toBeVisible();
  await dialog.getByLabel('Internal shortfall reason').fill(reason);
  await dialog
    .getByRole('button', { name: 'Reserve available quantity' })
    .click();
  await expect(
    panel.getByText('Partially reserved', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

async function createActiveBulkRental(
  page: Page,
  quantity = 2,
  productName = process.env.PHASE15_DELIVERY_PRODUCT_NAME,
) {
  expect(productName).toBeTruthy();
  const created = await createOrder(page, 0, quantity, 'DELIVERY', productName);
  await reserveCurrentOrderInFull(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start preparation' }).click();
  await page.getByLabel('Prepared total').fill(String(quantity));
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await page.getByLabel('Checkout now').fill(String(quantity));
  await page.getByLabel('Recipient name').fill('Phase 16 Return Customer');
  await page
    .getByRole('button', { name: 'Confirm delivery and check out' })
    .click();
  await expect(page.getByText('CHECKED OUT', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto('http://localhost:3001/active-rentals');
  await page.getByText(created.orderNumber, { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Return intake' }),
  ).toBeVisible();
  const activeRentalId = new URL(page.url()).pathname
    .split('/')
    .filter(Boolean)
    .at(-1);
  expect(activeRentalId).toBeTruthy();
  return { ...created, activeRentalId: activeRentalId! };
}

async function createActiveSerializedRental(page: Page) {
  const productName = process.env.PHASE15_SERIALIZED_PRODUCT_NAME;
  const assetNumber = process.env.PHASE15_SERIALIZED_ASSET_NUMBER;
  expect(productName).toBeTruthy();
  expect(assetNumber).toBeTruthy();
  const created = await createOrder(page, 0, 1, 'PICKUP', productName);
  await page.getByRole('button', { name: 'Load eligible assets' }).click();
  await page.getByLabel(new RegExp(assetNumber!)).first().check();
  await reserveCurrentOrderInFull(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start preparation' }).click();
  const fulfilment = page.locator(
    'section[aria-labelledby="fulfilment-heading"]',
  );
  await fulfilment.getByLabel(new RegExp(assetNumber!)).check();
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await page.getByLabel('Checkout now').fill('1');
  await page.getByLabel('Recipient name').fill('Serialized Return Customer');
  await page
    .getByRole('button', { name: 'Confirm pickup and check out' })
    .click();
  await expect(page.getByText('CHECKED OUT', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto('http://localhost:3001/active-rentals');
  await page.getByText(created.orderNumber, { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Return intake' }),
  ).toBeVisible();
  const activeRentalId = new URL(page.url()).pathname
    .split('/')
    .filter(Boolean)
    .at(-1);
  expect(activeRentalId).toBeTruthy();
  return {
    ...created,
    activeRentalId: activeRentalId!,
    assetNumber: assetNumber!,
  };
}

test('@phase12-1 @orders @admin-orders creates one confirmed order and exposes read-only administration', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { customerLink, marker, orderNumber } = await createOrder(page);

  await expect(
    page.getByRole('heading', { name: orderNumber, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const orderPdf = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download order PDF' }).click();
  expect((await orderPdf).suggestedFilename()).toMatch(/RO-.*\.pdf$/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Rotate link' }).click();
  await expect(
    page
      .getByText('Secure link shown for this action only')
      .locator('..')
      .locator('code'),
  ).not.toHaveText(customerLink);
  const oldLinkContext = await browser.newContext();
  const oldLinkPage = await oldLinkContext.newPage();
  await oldLinkPage.goto(customerLink);
  await expect(
    oldLinkPage.getByText('This order link is unavailable.'),
  ).toBeVisible();
  await oldLinkContext.close();
  await expect(page.getByText('Reservation: NOT RESERVED')).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(
    /reserve now|assign asset|adjust inventory|mark delivered|mark returned/i,
  );

  await page.goto('http://localhost:3001/orders');
  await page.getByLabel('Search rental orders').fill(orderNumber);
  await expect(
    page.getByRole('link', { name: new RegExp(orderNumber) }),
  ).toBeVisible();
  await axe(page);
});

test('@orders @customer-orders exchanges a dedicated fragment and renders a confidential-safe order', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const { customerLink, marker, orderNumber } = await createOrder(page);

  await page.goto(customerLink);
  await expect(page).toHaveURL('http://localhost:3000/order');
  await expect(
    page.getByRole('heading', { name: `Rental order ${orderNumber}` }),
  ).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await expect(
    page.getByText(/equipment allocation and fulfill?ment/i),
  ).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('PRIVATE-P12-SENTINEL');
  expect(body).not.toMatch(
    /available quantity|remaining quantity|total quantity|reserved quantity|asset number|serial number|operation id|payload hash|access hash|reserve now|assign asset/i,
  );
  expect(page.url()).not.toContain('capability');

  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Rental order ${orderNumber}` }),
  ).toBeVisible();
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await axe(page);

  const unauthenticated = await browser.newContext();
  const unauthenticatedPage = await unauthenticated.newPage();
  await unauthenticatedPage.goto(
    `http://localhost:3000/order?orderNumber=${encodeURIComponent(orderNumber)}`,
  );
  await expect(
    unauthenticatedPage.getByRole('heading', { name: 'Order unavailable' }),
  ).toBeVisible();
  await unauthenticated.close();
});

test('@reservations @admin-reservations staff intentionally creates a partial reservation and releases it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  await createOrder(page);
  const panel = reservationPanel(page);
  await expect(
    panel.getByRole('heading', { name: 'Inventory reservation' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    panel.getByText(/created from confirmed rental orders/i),
  ).toBeVisible();
  await expect(panel.getByText('Not reserved', { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: 'Check availability and reserve' })
    .click();
  const confirmation = page.getByRole('dialog');
  await expect(
    confirmation.getByRole('heading', {
      name: 'Full reservation is not currently possible.',
    }),
  ).toBeVisible();
  await expect(confirmation.getByText('Ordered')).toBeVisible();
  await expect(confirmation.getByText('Available now')).toBeVisible();
  await expect(confirmation.getByText('Missing')).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Reserve available quantity' })
    .click();
  await expect(
    confirmation.getByText(
      'Enter an internal reason for the partial reservation.',
    ),
  ).toBeVisible();
  await confirmation
    .getByLabel('Internal shortfall reason')
    .fill('Browser-test intentional shortfall');
  await confirmation
    .getByRole('button', { name: 'Reserve available quantity' })
    .click();
  await expect(
    panel.getByText('Partially reserved', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText('Internal only').first()).toBeVisible();
  await panel.getByLabel('Release reason').fill('Browser-test release');
  await panel
    .getByRole('button', { name: 'Release entire reservation' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm release' })
    .click();
  await expect(panel.getByText('Released', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await axe(page);
});

test('@reservations @admin-reservations full reservation dialog is accessible at 320px and restores focus', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  await createOrder(page, 1, 2);
  const panel = reservationPanel(page);
  const trigger = panel.getByRole('button', {
    name: 'Check availability and reserve',
  });
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Confirm full reservation' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reserve in full' })
    .click();
  await expect(panel.getByText('Reserved', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await panel.getByLabel('Release reason').fill('320px browser-test release');
  await panel
    .getByRole('button', { name: 'Release entire reservation' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm release' })
    .click();
  await expect(panel.getByText('Released', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test('@reservations @reservation-concurrency duplicate reservation submission is idempotent', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { orderId } = await createOrder(page);
  const operationId = crypto.randomUUID();
  const body = {
    allowPartial: true,
    operationId,
    overrideReason: 'Browser-test idempotent intentional shortfall',
    serializedSelections: [],
  };
  const [first, replay] = await Promise.all([
    page.request.post(
      `http://localhost:3001/api/orders/${orderId}/reservations`,
      { data: body, headers: { Origin: 'http://localhost:3001' } },
    ),
    page.request.post(
      `http://localhost:3001/api/orders/${orderId}/reservations`,
      { data: body, headers: { Origin: 'http://localhost:3001' } },
    ),
  ]);
  expect([first.status(), replay.status()].sort()).toEqual([201, 201]);
  const [firstBody, replayBody] = await Promise.all([
    first.json(),
    replay.json(),
  ]);
  expect(firstBody.id).toBe(replayBody.id);
  expect(firstBody.version).toBe(replayBody.version);
});

async function createPartiallyReservedOrder(page: Page, productIndex = 0) {
  const created = await createOrder(page, productIndex);
  await reserveCurrentOrderPartially(
    page,
    'Phase 15 isolated reservation shortfall',
  );
  await page.reload();
  return created;
}

test('@fulfilment @admin-fulfilment @active-rentals prepares, checks out partially, and exposes only customer-safe status', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const { customerLink, orderId, orderNumber } =
    await createPartiallyReservedOrder(page, 0);
  await page.getByRole('button', { name: 'Start preparation' }).click();
  await expect(page.getByText('PREPARING', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const prepared = page.getByLabel('Prepared total').first();
  await prepared.fill('2');
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await expect(page.getByLabel('Prepared quantity')).toHaveText('2');
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByText('READY', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Recipient name').fill('Phase 15 Customer');
  await page.getByLabel('This is an intentional partial checkout').check();
  await page
    .getByLabel('Internal partial-checkout reason')
    .fill('One commercially requested unit remains unavailable.');
  await page
    .getByRole('button', { name: 'Confirm pickup and check out' })
    .click();
  await expect(
    page.getByText('PARTIALLY CHECKED OUT', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto('http://localhost:3001/active-rentals');
  await expect(page.getByText(orderNumber, { exact: true })).toBeVisible();
  await page.getByText(orderNumber, { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Checked-out equipment' }),
  ).toBeVisible();
  const [firstPdf, repeatedPdf] = await Promise.all([
    page.request.get(
      `http://localhost:3001/api/orders/${orderId}/fulfilment/picking-pdf`,
    ),
    page.request.get(
      `http://localhost:3001/api/orders/${orderId}/fulfilment/picking-pdf`,
    ),
  ]);
  expect([firstPdf.status(), repeatedPdf.status()]).toEqual([200, 200]);
  expect(firstPdf.headers()['content-type']).toContain('application/pdf');
  await page.goto(customerLink);
  await expect(
    page.getByText('Rental active', { exact: true }).first(),
  ).toBeVisible();
  const customerText = await page.locator('body').innerText();
  expect(customerText).not.toMatch(
    /reserved remaining|prepared quantity|shortfall|asset number|serial number|internal partial/i,
  );
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await axe(page);
});

test('@fulfilment @admin-fulfilment @active-rentals fully checks out a delivery order', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const productName = process.env.PHASE15_DELIVERY_PRODUCT_NAME;
  expect(productName).toBeTruthy();
  const { customerLink, orderNumber } = await createOrder(
    page,
    0,
    2,
    'DELIVERY',
    productName,
  );
  await reserveCurrentOrderInFull(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start preparation' }).click();
  await page.getByLabel('Prepared total').fill('2');
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await expect(page.getByLabel('Prepared quantity')).toHaveText('2');
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await page.getByLabel('Checkout now').fill('2');
  await page.getByLabel('Recipient name').fill('Delivery Recipient');
  await page
    .getByRole('button', { name: 'Confirm delivery and check out' })
    .click();
  await expect(page.getByText('CHECKED OUT', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const activeList = await (
    await page.request.get(
      `http://localhost:3001/api/active-rentals?search=${encodeURIComponent(orderNumber)}`,
    )
  ).json();
  expect(activeList.items).toHaveLength(1);
  const activeDetail = await (
    await page.request.get(
      `http://localhost:3001/api/active-rentals/${activeList.items[0].id}`,
    )
  ).json();
  expect(activeDetail).toMatchObject({
    fulfilmentMethod: 'DELIVERY',
    handoffs: [
      {
        destination: '15 Phase Street, Accra',
        recipientName: 'Delivery Recipient',
        type: 'DELIVERY',
      },
    ],
    status: 'ACTIVE',
  });
  await page.goto('http://localhost:3001/active-rentals');
  await page.getByText(orderNumber, { exact: true }).click();
  await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();
  await page.goto(customerLink);
  await expect(
    page.getByText('Rental active', { exact: true }).first(),
  ).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(
    /reserved quantity|prepared quantity|asset number|serial number|staff/i,
  );
});

test('@fulfilment @admin-fulfilment checks out the exact prepared serialized asset once', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const productName = process.env.PHASE15_SERIALIZED_PRODUCT_NAME;
  const assetNumber = process.env.PHASE15_SERIALIZED_ASSET_NUMBER;
  expect(productName).toBeTruthy();
  expect(assetNumber).toBeTruthy();
  const { customerLink, orderId } = await createOrder(
    page,
    0,
    1,
    'PICKUP',
    productName,
  );
  await page.getByRole('button', { name: 'Load eligible assets' }).click();
  await page.getByLabel(new RegExp(assetNumber!)).first().check();
  await reserveCurrentOrderInFull(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start preparation' }).click();
  const fulfilmentPanel = page.locator(
    'section[aria-labelledby="fulfilment-heading"]',
  );
  await fulfilmentPanel.getByLabel(new RegExp(assetNumber!)).check();
  await page.getByRole('button', { name: 'Save preparation' }).click();
  await expect(page.getByLabel('Prepared quantity')).toHaveText('1');
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await page.getByLabel('Checkout now').fill('1');
  await page.getByLabel('Recipient name').fill('Serialized Recipient');
  await page
    .getByRole('button', { name: 'Confirm pickup and check out' })
    .click();
  await expect(page.getByText('CHECKED OUT', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const fulfilment = await (
    await page.request.get(
      `http://localhost:3001/api/orders/${orderId}/fulfilment`,
    )
  ).json();
  expect(fulfilment.items[0].serializedAllocations).toEqual([
    expect.objectContaining({
      assetNumber,
      prepared: false,
      status: 'CONSUMED',
    }),
  ]);
  await page.goto(customerLink);
  const customerText = await page.locator('body').innerText();
  expect(customerText).not.toContain(assetNumber);
  expect(customerText).not.toMatch(/serial number|reserved quantity|prepared/i);
});

test('@fulfilment @fulfilment-concurrency duplicate checkout is idempotent and consumes once', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { orderId } = await createPartiallyReservedOrder(page, 1);
  const reservation = await (
    await page.request.get(
      `http://localhost:3001/api/orders/${orderId}/reservation`,
    )
  ).json();
  const startBody = {
    operationId: crypto.randomUUID(),
    expectedReservationVersion: reservation.version,
  };
  const startedResponse = await page.request.post(
    `http://localhost:3001/api/orders/${orderId}/fulfilment/start-preparation`,
    {
      data: startBody,
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(startedResponse.status()).toBe(201);
  const started = await startedResponse.json();
  const item = started.items[0];
  const preparedResponse = await page.request.put(
    `http://localhost:3001/api/orders/${orderId}/fulfilment/preparation`,
    {
      data: {
        expectedVersion: started.version,
        items: [
          {
            quantity: item.reservedQuantity,
            rentalOrderItemId: item.rentalOrderItemId,
            serializedAllocationIds: [],
          },
        ],
        operationId: crypto.randomUUID(),
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(preparedResponse.status()).toBe(200);
  const prepared = await preparedResponse.json();
  const readyResponse = await page.request.post(
    `http://localhost:3001/api/orders/${orderId}/fulfilment/mark-ready`,
    {
      data: {
        expectedVersion: prepared.version,
        operationId: crypto.randomUUID(),
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(readyResponse.status()).toBe(201);
  const ready = await readyResponse.json();
  const checkoutBody = {
    allowPartial: true,
    expectedReservationVersion: reservation.version,
    expectedVersion: ready.version,
    handoffAt: new Date().toISOString(),
    internalReason: 'Browser-test partial checkout concurrency.',
    items: [
      {
        quantity: item.reservedQuantity,
        rentalOrderItemId: item.rentalOrderItemId,
        serializedAllocationIds: [],
      },
    ],
    operationId: crypto.randomUUID(),
    recipientName: 'Concurrency Customer',
  };
  const competingCheckoutBody = {
    ...checkoutBody,
    operationId: crypto.randomUUID(),
  };
  const responses = await Promise.all([
    page.request.post(
      `http://localhost:3001/api/orders/${orderId}/fulfilment/checkout`,
      { data: checkoutBody, headers: { Origin: 'http://localhost:3001' } },
    ),
    page.request.post(
      `http://localhost:3001/api/orders/${orderId}/fulfilment/checkout`,
      {
        data: competingCheckoutBody,
        headers: { Origin: 'http://localhost:3001' },
      },
    ),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    201, 409,
  ]);
  const winnerIndex = responses.findIndex(
    (response) => response.status() === 201,
  );
  const winner = await responses[winnerIndex]!.json();
  const winningInput = winnerIndex === 0 ? checkoutBody : competingCheckoutBody;
  const replay = await page.request.post(
    `http://localhost:3001/api/orders/${orderId}/fulfilment/checkout`,
    { data: winningInput, headers: { Origin: 'http://localhost:3001' } },
  );
  expect(replay.status()).toBe(201);
  const replayed = await replay.json();
  expect(winner.id).toBe(replayed.id);
  expect(winner.version).toBe(replayed.version);
  expect(winner.items[0].consumedQuantity).toBe(item.reservedQuantity);
  expect(winner.items[0].reservedQuantity).toBe(0);
});

test('@returns @admin-returns records a complete bulk return at 320px and exposes only customer-safe progress', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const { customerLink, orderNumber } = await createActiveBulkRental(
    page,
    2,
    process.env.PHASE16_ADMIN_RETURN_PRODUCT_NAME,
  );
  const activeRentalUrl = page.url();
  await page.getByLabel('rentable', { exact: false }).fill('1');
  await page.getByRole('button', { name: 'Record return intake' }).click();
  await expect(
    page.getByText(
      /inventory and reconciliation state were updated atomically/i,
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/PARTIALLY RETURNED/i)).toBeVisible();
  const partialSummary = await (
    await page.request.get('http://localhost:3001/api/work-summary')
  ).json();
  expect(partialSummary.returns.partiallyReturned).toBe(1);
  await page.goto(customerLink);
  await expect(
    page.getByText('PARTIALLY RECEIVED', { exact: true }),
  ).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(
    /asset number|serial number|rentable quantity|damaged quantity|maintenance quantity|inventory state|staff|operation id|payload hash/i,
  );
  await page.goto(activeRentalUrl);
  await page.getByLabel('rentable', { exact: false }).fill('1');
  await page.getByRole('button', { name: 'Record return intake' }).click();
  await expect(
    page.getByText(
      /inventory and reconciliation state were updated atomically/i,
    ),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/READY TO COMPLETE/i)).toBeVisible();
  await page.getByRole('link', { name: 'Open reconciliation' }).click();
  await expect(page.getByRole('heading', { name: /^RET-/ })).toBeVisible();
  for (const name of ['receipt PDF', 'reconciliation PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  }
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reconcile return' }).click();
  await expect(page.getByText('Reconciliation evaluated.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Complete rental' }).click();
  await expect(page.getByText('Rental completed.')).toBeVisible();
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await axe(page);
  await page.goto(customerLink);
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).toContain(orderNumber);
  expect(text).not.toMatch(
    /asset number|serial number|rentable quantity|damaged quantity|maintenance quantity|inventory state|staff|operation id|payload hash/i,
  );
});

test('@returns @return-issues classifies damage and missing without changing total physical quantity', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { orderNumber } = await createActiveBulkRental(
    page,
    3,
    process.env.PHASE16_ISSUE_RETURN_PRODUCT_NAME,
  );
  await page.getByLabel('damaged', { exact: false }).fill('1');
  await page.getByLabel('missing', { exact: false }).fill('2');
  await page.getByRole('button', { name: 'Record return intake' }).click();
  await expect(page.getByText(/RECONCILIATION REQUIRED/i)).toBeVisible({
    timeout: 30_000,
  });
  await page.goto('http://localhost:3001/issues');
  await expect(
    page.getByText(orderNumber, { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator('a[href^="/issues/"]')).toHaveCount(2);
  await axe(page);
  const missingLink = page.getByRole('link', {
    name: new RegExp(`MISSING.*${orderNumber}`, 'i'),
  });
  const missingHref = await missingLink.getAttribute('href');
  expect(missingHref).toBeTruthy();
  const missingId = missingHref!.split('/').at(-1)!;
  const missing = await (
    await page.request.get(`http://localhost:3001/api/issues/${missingId}`)
  ).json();
  const currentReturn = await (
    await page.request.get(
      `http://localhost:3001/api/returns/${missing.returnId}`,
    )
  ).json();
  const recovered = await page.request.post(
    `http://localhost:3001/api/issues/${missingId}/resolutions`,
    {
      data: {
        assessedCentsDelta: 0,
        expectedIssueVersion: missing.version,
        expectedReturnVersion: currentReturn.version,
        internalReason: 'One missing browser fixture unit was recovered.',
        operationId: crypto.randomUUID(),
        outcome: 'ITEM_RETURNED',
        paidCentsDelta: 0,
        quantity: 1,
        resultingInventoryState: 'RENTABLE',
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(recovered.status()).toBe(201);
  await page.goto(`http://localhost:3001${missingHref}`);
  await expect(page.getByText('1 of 2')).toBeVisible();
  await page
    .getByLabel('Internal resolution reason')
    .fill('Approved customer-safe waiver browser verification.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'WAIVED' }).click();
  await expect(page.getByText('Issue resolution recorded.')).toBeVisible();
  await expect(page.getByText('0 of 2')).toBeVisible();
  await page.goto('http://localhost:3001/issues');
  await page
    .getByRole('link', { name: new RegExp(`DAMAGED.*${orderNumber}`, 'i') })
    .click();
  await page
    .getByLabel('Internal resolution reason')
    .fill('Repair completed and browser fixture passed inspection.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'REPAIRED' }).click();
  await expect(page.getByText('Issue resolution recorded.')).toBeVisible();
  await page.goto(`http://localhost:3001/returns/${missing.returnId}`);
  for (const name of ['missing PDF', 'damage PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  }
  await axe(page);
});

test('@returns @return-issues returns one exact serialized asset once and repairs it auditably', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { activeRentalId, assetNumber, customerLink, orderNumber } =
    await createActiveSerializedRental(page);
  const draft = await (
    await page.request.get(
      `http://localhost:3001/api/returns/active/${activeRentalId}`,
    )
  ).json();
  const serialized = draft.items[0].serializedAssets[0];
  await page.getByLabel(`Condition for ${assetNumber}`).selectOption('DAMAGED');
  await page.getByRole('button', { name: 'Record return intake' }).click();
  await expect(page.getByText(/RECONCILIATION REQUIRED/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel(`Condition for ${assetNumber}`)).toHaveCount(0);
  const current = await (
    await page.request.get(
      `http://localhost:3001/api/returns/active/${activeRentalId}`,
    )
  ).json();
  const duplicate = await page.request.post(
    `http://localhost:3001/api/returns/active/${activeRentalId}`,
    {
      data: {
        expectedVersion: current.version,
        items: [
          {
            activeRentalItemId: draft.items[0].activeRentalItemId,
            quantityDamaged: 0,
            quantityMaintenance: 0,
            quantityMissing: 0,
            quantityRentable: 1,
            serializedAssets: [
              {
                activeRentalSerializedAssetId:
                  serialized.activeRentalSerializedAssetId,
                disposition: 'RENTABLE',
              },
            ],
          },
        ],
        operationId: crypto.randomUUID(),
        receivedAt: new Date().toISOString(),
      },
      headers: { Origin: 'http://localhost:3001' },
    },
  );
  expect(duplicate.status()).toBe(422);
  await page.goto('http://localhost:3001/issues');
  await page
    .getByRole('link', { name: new RegExp(`DAMAGED.*${orderNumber}`, 'i') })
    .click();
  await page
    .getByLabel('Internal resolution reason')
    .fill('Serialized asset repair passed inspection.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'REPAIRED' }).click();
  await expect(page.getByText('Issue resolution recorded.')).toBeVisible();
  await page.goto(customerLink);
  expect(await page.locator('body').innerText()).not.toMatch(
    new RegExp(`${assetNumber}|serial number|inventory state|staff`, 'i'),
  );
  await axe(page);
});

test('@returns @return-concurrency concurrent return commands produce one authoritative accounting result', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { activeRentalId } = await createActiveBulkRental(
    page,
    2,
    process.env.PHASE16_CONCURRENCY_RETURN_PRODUCT_NAME,
  );
  const draftResponse = await page.request.get(
    `http://localhost:3001/api/returns/active/${activeRentalId}`,
  );
  expect(draftResponse.ok()).toBe(true);
  const draft = (await draftResponse.json()) as {
    version: number;
    items: Array<{ activeRentalItemId: string }>;
  };
  const command = (operationId: string) => ({
    operationId,
    expectedVersion: draft.version,
    receivedAt: new Date().toISOString(),
    items: [
      {
        activeRentalItemId: draft.items[0]!.activeRentalItemId,
        quantityRentable: 2,
        quantityDamaged: 0,
        quantityMaintenance: 0,
        quantityMissing: 0,
        serializedAssets: [],
      },
    ],
  });
  const responses = await Promise.all([
    page.request.post(
      `http://localhost:3001/api/returns/active/${activeRentalId}`,
      {
        data: command(crypto.randomUUID()),
        headers: { Origin: 'http://localhost:3001' },
      },
    ),
    page.request.post(
      `http://localhost:3001/api/returns/active/${activeRentalId}`,
      {
        data: command(crypto.randomUUID()),
        headers: { Origin: 'http://localhost:3001' },
      },
    ),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([
    201, 409,
  ]);
  const current = await page.request.get(
    `http://localhost:3001/api/returns/active/${activeRentalId}`,
  );
  const result = (await current.json()) as {
    version: number;
    items: Array<{ receivedQuantity: number; outstandingQuantity: number }>;
  };
  expect(result.version).toBe(1);
  expect(result.items[0]).toMatchObject({
    receivedQuantity: 2,
    outstandingQuantity: 0,
  });
});
