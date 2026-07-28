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

async function createAcceptedQuote(page: Page) {
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
    const productHref = await page
      .locator('article a[href^="/rentals/"]')
      .first()
      .getAttribute('href');
    expect(productHref).toBeTruthy();
    await page.goto(`http://localhost:3000${productHref}`);
    await page.getByLabel('Desired quantity').fill('3');
    await page.getByRole('button', { name: 'Add to rental cart' }).click();
    await expect(
      page.getByRole('link', { name: 'Rental cart, 1 equipment type' }),
    ).toBeVisible();
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
    await page.getByRole('button', { name: 'Review request' }).click();
    await page.getByRole('button', { name: 'Submit rental request' }).click();
    await expect(page).toHaveURL(/rental-requests\/MR-/, { timeout: 30_000 });
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
  await expect(unitPrices.first()).toBeVisible();
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

async function createOrder(page: Page) {
  const fixture = await createAcceptedQuote(page);
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
  return { ...fixture, customerLink, orderNumber };
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
  await expect(page.getByText('Inventory not reserved')).toBeVisible();
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
