import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

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
  await page.getByRole('link', { name: 'Continue to rental request' }).click();

  const marker = `E2E-P12-${Date.now()}`;
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
  await expect(page).toHaveURL(/rental-requests\/MR-/);
  const reference = (await page.getByText(/Reference:/).innerText())
    .replace('Reference:', '')
    .trim();

  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(credential('STAFF_BOOTSTRAP_EMAIL'));
  await page
    .getByLabel(/password/i)
    .fill(credential('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
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

  const unitPrices = page.getByLabel('Unit price (CAD)');
  await expect(unitPrices.first()).toBeVisible();
  for (let index = 0; index < (await unitPrices.count()); index += 1)
    await unitPrices.nth(index).fill('125.50');
  await page.getByRole('button', { name: 'Add charge' }).click();
  await page.getByLabel('Type').selectOption('DELIVERY');
  await page.getByLabel('Customer label').fill('Delivery');
  await page.getByLabel('Amount (CAD)').fill('10.00');
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

  await page.goto(quoteLink);
  await expect(page).toHaveURL('http://localhost:3000/quote');
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
  const customerLinkSection = page
    .getByRole('heading', { name: 'Secure customer order link' })
    .locator('..');
  await expect(customerLinkSection).toBeVisible();
  const customerLink = await customerLinkSection.locator('code').innerText();
  const orderLink = customerLinkSection.getByRole('link', { name: /Open RO-/ });
  const orderNumber = (await orderLink.innerText()).replace('Open ', '').trim();
  return { ...fixture, customerLink, orderNumber };
}

test('@orders @admin-orders creates one confirmed order and exposes read-only administration', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-1024');
  const { marker, orderNumber } = await createOrder(page);

  await page.getByRole('link', { name: `Open ${orderNumber}` }).click();
  await expect(
    page.getByRole('heading', { name: orderNumber, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
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
